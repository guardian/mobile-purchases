import {HttpRequestHeaders} from "../models/apiGatewayHttp";
import {Option} from "./option";
import {restClient} from "./restClient";

interface UserId {
    id: string
}

interface IdentityResponse {
    status: string,
    user: UserId
}

interface OktaJwtVerifierReturn {
    claims : {
        scp: [string],
        legacy_identity_id: string,
    }
}

export function getAuthToken(headers: HttpRequestHeaders): string | undefined {
    return (headers["Authorization"] ?? headers["authorization"])?.replace("Bearer ", "");
}

async function getUserId_OldIdentity(headers: HttpRequestHeaders): Promise<Option<string>> {
    const url = "https://id.guardianapis.com/user/me";
    const identityToken = getAuthToken(headers);

    try {
        const response = await restClient.get<IdentityResponse>(url, {additionalHeaders: {Authorization: `Bearer ${identityToken}`}})

        if(response.result) {
            return response.result.user.id
        } else {
            return null;
        }
    } catch (error) {
        // The REST client used here throws on 403s, so we have to try...catch
        // instead of handling this case in the response object above
        // https://github.com/microsoft/typed-rest-client#rest
        if ((error as any).statusCode === 403) {
            console.warn('Identity API returned 403');
            return null;
        } else {
            throw error;
        }
    }
}

async function getUserId_NewOkta(headers: HttpRequestHeaders): Promise<Option<string>> {
    try {
        const OktaJwtVerifier = require('@okta/jwt-verifier');

        const ISSUER      = 'https://profile.code.dev-theguardian.com/oauth2/aus3v9gla95Toj0EE0x7'
        const CLIENT_ID   = "0oa4iyjx692Aj8SlZ0x7"
        const expectedAud = "https://profile.code.dev-theguardian.com/";
        
        const oktaJwtVerifier = new OktaJwtVerifier({
            issuer: ISSUER,
            clientId: CLIENT_ID,
            assertClaims: {'scp.includes': ['email']}
          });
        
        const accessTokenString = getAuthToken(headers);

        // Date: 28th December 2022
        // Author: Pascal 
          
        // We want: 
        //       401 for an invalid/expired access token.
        //       403 for an invalid scope, and 

        // If the authentication fails, mostly because the access token is invalid, then oktaJwtVerifier.verifyAccessToken
        // throw an error. That error would bubble up to a servor error (500), which is not what we want. 
        // In that case we just catch the error and return a null, which the function { parseAndStoreLink } which called us
        // will return as a HTTPResponses.UNAUTHORISED, meaning a 401

        // If fail the scope check then for the moment, we return a magic value and let { parseAndStoreLink } deal with it. 
        // The reason for simply not returning the right type, is that we are calling not only the new but also version 
        // of this (for backward compatibility with the old identity authentication), and at this stage I am not updating 
        // all signatures. So overloading it is.
        
        try {
            return await oktaJwtVerifier.verifyAccessToken(accessTokenString, expectedAud)
            .then((payload: OktaJwtVerifierReturn) => {
                if (payload.claims.scp.includes('email')) { 
                    // We have found the email address claim
                    // The claims attribute maps to
                    /*
                        {
                            ver: 1,
                            jti: 'EDITED',
                            iss: 'https://profile.code.dev-theguardian.com/oauth2/aus3v9gla95Toj0EE0x7',
                            aud: 'https://profile.code.dev-theguardian.com/',
                            iat: 1672252869,
                            exp: 1672256469,
                            cid: '0oa4iyjx692Aj8SlZ0x7',
                            uid: '00u38ar4186TSK9j00x7',
                            scp: [ 'email', 'openid', 'profile' ],
                            auth_time: 1671029934,
                            sub: 'EDITED',
                            identity_username: '',
                            email_validated: true,
                            legacy_identity_id: 'EDITED'
                        }
                    */
                    // Let's use the legacy_identity_id
                    return payload.claims.legacy_identity_id; 
                } else {
                    // We have passed authentication but we didn't pass the scope check
                    return "1234567890";
                }
            }); 
        } catch (error) {
            return null;
        }
    } catch (error) {
        throw error;
    }
}

export async function getUserId(headers: HttpRequestHeaders): Promise<Option<string>> {
    // This function is the front that implement the common interface behind which there is the old (Identity) 
    // and new (Okta) authentication methods
    const userId1 = await getUserId_OldIdentity(headers);
    if (userId1) {
        return userId1
    }
    return await getUserId_NewOkta(headers);
}