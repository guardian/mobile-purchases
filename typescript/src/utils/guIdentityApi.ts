import {HttpRequestHeaders} from "../models/apiGatewayHttp";
import {restClient} from "./restClient";
import {Stage} from "../utils/appIdentity";
import {getConfigValue} from "./ssmConfig";

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

interface OktaStageParameters {
    issuer: string,
    expectedAud: string,
    scope: string
}

export interface UserIdResolution {
    status: "incorrect-token" | "incorrect-scope" | "missing-identity-id" | "success",
    userId: null | string
}

export async function getIdentityApiKey(): Promise<string> {
    return await getConfigValue<string>("mp-soft-opt-in-identity-api-key");
}

export async function getMembershipAccountId(): Promise<string> {
    return await getConfigValue<string>("membershipAccountId");
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

function getOktaStageParameters(stage: string): OktaStageParameters {
    if (stage === "PROD") {
        return {
            issuer: 'https://profile.theguardian.com/oauth2/aus3xgj525jYQRowl417',
            expectedAud: "https://profile.theguardian.com/",
            scope: "guardian.mobile-purchases-api.update.self"
        }
    } else {
        return {
            issuer: 'https://profile.code.dev-theguardian.com/oauth2/aus3v9gla95Toj0EE0x7',
            expectedAud: "https://profile.code.dev-theguardian.com/",
            scope: "guardian.mobile-purchases-api.update.self"
        }
    }
}

async function getUserId_NewOkta(headers: HttpRequestHeaders): Promise<UserIdResolution> {
    try {
        const OktaJwtVerifier = require('@okta/jwt-verifier');
        
        const oktaparams = getOktaStageParameters(Stage);

        const issuer      = oktaparams.issuer;
        const expectedAud = oktaparams.expectedAud;
        const scope       = oktaparams.scope;

        const oktaJwtVerifier = new OktaJwtVerifier({
            issuer: issuer,
          });
        
        const accessTokenString = getAuthToken(headers);

        try {
            return await oktaJwtVerifier.verifyAccessToken(accessTokenString, expectedAud)
            .then((payload: OktaJwtVerifierReturn) => {
                if (payload.claims.scp.includes(scope)) { 
                    if (payload.claims.legacy_identity_id) {
                        return {status: "success", userId: payload.claims.legacy_identity_id};
                    } else {
                        return {status: "missing-identity-id", userId: null};
                    }
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
    we need to return { HTTPResponses.FORBIDDEN, 403 }. Additionaly note that if the claim that carries the
    identity id is missing, we return { HTTPResponses.INVALID_REQUEST, 400 }.

    Incorrect token                     -> 401
    Incorrect scope                     -> 403
    Missing claim / Missing identity id -> 400
    Successful request                  -> 200

    To be able to convey to { function: parseAndStoreLink } which case occured during the authentication,
    we are extending the return type of the getUserId functions, to become a { UserIdResolution }
*/

/*
    Date: 07th Jan 2022

    When we complete the transition to Okta, we will have to keep the UserIdResolution type,
    But we will be able to get rid of getUserId_OldIdentity without any other change.

    Note that the reason we perform the old Identity authentication before the Okta authentication
    is because the Okta authentication fails in more ways than the old authentication and in order to keep 
    the code simple while returning the right code, it need to be done in that order.
*/

export async function getUserId(headers: HttpRequestHeaders): Promise<UserIdResolution> {
    const resolution = await getUserId_OldIdentity(headers);
    if (resolution.status == "success") {
        return resolution;
    }
    return await getUserId_NewOkta(headers);
}
