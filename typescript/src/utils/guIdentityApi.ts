import type { HttpRequestHeaders } from '../models/apiGatewayHttp';
import { Stage } from '../utils/appIdentity';
import { restClient } from './restClient';
import { getConfigValue } from './ssmConfig';

interface UserId {
    id: string;
}

interface IdentityResponse {
    status: string;
    user: UserId;
}

interface OktaJwtVerifierReturn {
    claims: {
        scp: [string];
        legacy_identity_id: string;
    };
}

interface OktaStageParameters {
    issuer: string;
    expectedAud: string;
    scope: string;
}

export interface UserIdResolution {
    status: 'incorrect-token' | 'incorrect-scope' | 'missing-identity-id' | 'success';
    userId: null | string;
}

export async function getIdentityApiKey(): Promise<string> {
    return await getConfigValue<string>('mp-soft-opt-in-identity-api-key');
}

export async function getMembershipAccountId(): Promise<string> {
    return await getConfigValue<string>('membershipAccountId');
}

export async function getIdentityUrl(): Promise<string> {
    return await getConfigValue<string>('mp-soft-opt-in-identity-user-consent-domain-url');
}

export function getAuthToken(headers: HttpRequestHeaders): string | undefined {
    return (headers['Authorization'] ?? headers['authorization'])?.replace('Bearer ', '');
}

function getOktaStageParameters(stage: string): OktaStageParameters {
    if (stage === 'PROD') {
        return {
            issuer: 'https://profile.theguardian.com/oauth2/aus3xgj525jYQRowl417',
            expectedAud: 'https://profile.theguardian.com/',
            scope: 'guardian.mobile-purchases-api.update.self',
        };
    } else {
        return {
            issuer: 'https://profile.code.dev-theguardian.com/oauth2/aus3v9gla95Toj0EE0x7',
            expectedAud: 'https://profile.code.dev-theguardian.com/',
            scope: 'guardian.mobile-purchases-api.update.self',
        };
    }
}

export async function getUserId(headers: HttpRequestHeaders): Promise<UserIdResolution> {
    try {
        const OktaJwtVerifier = require('@okta/jwt-verifier');

        const oktaparams = getOktaStageParameters(Stage);

        const issuer = oktaparams.issuer;
        const expectedAud = oktaparams.expectedAud;
        const scope = oktaparams.scope;

        const oktaJwtVerifier = new OktaJwtVerifier({
            issuer: issuer,
        });

        const accessTokenString = getAuthToken(headers);

        try {
            return await oktaJwtVerifier
                .verifyAccessToken(accessTokenString, expectedAud)
                .then((payload: OktaJwtVerifierReturn) => {
                    if (payload.claims.scp.includes(scope)) {
                        if (payload.claims.legacy_identity_id) {
                            return {
                                status: 'success',
                                userId: payload.claims.legacy_identity_id,
                            };
                        } else {
                            return { status: 'missing-identity-id', userId: null };
                        }
                    } else {
                        // We have passed authentication but we didn't pass the scope check
                        return { status: 'incorrect-scope', userId: null };
                    }
                });
        } catch (error) {
            return { status: 'incorrect-token', userId: null };
        }
    } catch (error) {
        throw error;
    }
}
