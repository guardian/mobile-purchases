import {HttpRequestHeaders} from "../models/apiGatewayHttp";
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

export interface UserIdResolution {
    status: "incorrect-token" | "incorrect-scope" | "success",
    userId: null | string
}

export function getAuthToken(headers: HttpRequestHeaders): string | undefined {
    return (headers["Authorization"] ?? headers["authorization"])?.replace("Bearer ", "");
}

async function getUserId_OldIdentity(headers: HttpRequestHeaders): Promise<UserIdResolution> {
    const url = "https://id.guardianapis.com/user/me";
    const identityToken = getAuthToken(headers);

    try {
        const response = await restClient.get<IdentityResponse>(url, {additionalHeaders: {Authorization: `Bearer ${identityToken}`}})

        if(response.result) {
            return {status: "success", userId: response.result.user.id};
        } else {
            return {status: "incorrect-token", userId: null};
        }
    } catch (error) {
        if ((error as any).statusCode === 403) {
            console.warn('Identity API returned 403');
            return {status: "incorrect-token", userId: null};
        } else {
            throw error;
        }
    }
}

async function getUserId_NewOkta(headers: HttpRequestHeaders): Promise<UserIdResolution> {
    try {
        const OktaJwtVerifier = require('@okta/jwt-verifier');

        const ISSUER      = 'https://profile.code.dev-theguardian.com/oauth2/aus3v9gla95Toj0EE0x7'
        const CLIENT_ID   = "0oa4iyjx692Aj8SlZ0x7"
        const expectedAud = "https://profile.code.dev-theguardian.com/";
        const scope       = "guardian.mobile-purchases-api.update.self"
        
        const oktaJwtVerifier = new OktaJwtVerifier({
            issuer: ISSUER,
            clientId: CLIENT_ID,
          });
        
        const accessTokenString = getAuthToken(headers);

        try {
            return await oktaJwtVerifier.verifyAccessToken(accessTokenString, expectedAud)
            .then((payload: OktaJwtVerifierReturn) => {
                if (payload.claims.scp.includes(scope)) { 
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
                    return {status: "success", userId: payload.claims.legacy_identity_id};
                } else {
                    // We have passed authentication but we didn't pass the scope check
                    return {status: "incorrect-scope", userId: null};
                }
            }); 
        } catch (error) {
            return {status: "incorrect-token", userId: null};
        }
    } catch (error) {
        throw error;
    }
}

// Function getUserId is the front that implements the common interface behind which 
// the old (Identity) and the new (Okta) authentication methods.

/*
    Date: 31st Dec 2022

    Function getUserId_OldIdentity used to perform the resolution of a authorization token and used to
    return null or a string (the userId). That value was handled by the caller { function: parseAndStoreLink }.
    In the case of null we would return a { HTTPResponses.UNAUTHORISED, 401 }

    When we moved to the Okta authentication, we needed to make the difference between failures
    due to an incorrect token and failures due to incorrect scopes. In the case of an incorrect
    token we need to return { HTTPResponses.UNAUTHORISED, 401 } but in the case of incorrect scope
    we need to return { HTTPResponses.FORBIDDEN, 403 }.

    To be able to convey to { function: parseAndStoreLink } which case occured during the authentication,
    we are extending the return type of the getUserId functions, to become a { UserIdResolution }
*/

export async function getUserId(headers: HttpRequestHeaders): Promise<UserIdResolution> {
    const resolution = await getUserId_OldIdentity(headers);
    if (resolution.status == "success") {
        return resolution;
    }
    return await getUserId_NewOkta(headers);
}
