import fetch from 'node-fetch';
import { getConfigValue } from '../utils/ssmConfig';

function apiKeyForBraze(): Promise<string> {
  return getConfigValue<string>('braze-api-key');
}

export interface IdentityIdFromBraze {
  // Optional because there are cases where no identity account exists for a user in Braze
  identityId?: string;
}

export async function getIdentityIdFromBraze(
  externalId: string,
): Promise<IdentityIdFromBraze> {
  const apiKey = await apiKeyForBraze();

  const params = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_ids: [externalId],
      fields_to_export: ['custom_attributes'],
    }),
  };

  const url = 'https://rest.fra-01.braze.eu/users/export/ids';

  return fetch(url, params).then(async (response) => {
    if (response.ok) {
      const json = await response.json();
      const identityId = json?.users?.[0]?.custom_attributes?.identity_id;
      if (identityId) {
        return { identityId };
      }
      console.log(`Response from Braze for Braze ID '${externalId}' did not contain an identity_id`);
      return {};
    } else {
      throw new Error(
        'Received a non-ok response from Braze attempting to fetch user',
      );
    }
  });
}
