import { getConfigValue } from "../utils/ssmConfig";
import fetch from 'node-fetch';

function apiKeyForBraze(): Promise<string> {
    return getConfigValue<string>("braze-api-key")
}

export async function getIdentityIdFromBraze(externalId: string): Promise<string> {
    const apiKey = await apiKeyForBraze();

    const params = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ external_ids: [ externalId ], fields_to_export: [ "custom_attributes"] })
    }

    const url = "https://rest.fra-01.braze.eu/users/export/ids"

    return fetch(url, params)
        .then(async (response) => {
            if (response.ok) {
                const json = await response.json();
                const identityId = json?.users?.[0]?.custom_attributes?.identity_id
                if (identityId) {
                    console.log(`Looked up identity id: '${identityId}' from external id: '${externalId}'`)
                    return identityId
                }
                throw new Error(`Unable to exchange the Braze ID '${externalId}' for an Identity ID`)
            } else {
                throw new Error("Unable to fetch user from Braze")
            }
        })
}