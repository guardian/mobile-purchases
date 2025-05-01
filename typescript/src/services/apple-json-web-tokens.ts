import { getConfigValue } from '../utils/ssmConfig';
const jwt = require('jsonwebtoken');

export const forgeStoreKitBearerToken = async (appBundleId: string): Promise<string> => {
  // ------------------------------------------------------------------------
  // This process is described in storekit-signatures.md in the docs folder. |
  // ------------------------------------------------------------------------

  // Generating the JWT token
  // https://developer.apple.com/documentation/appstoreserverapi/generating-json-web-tokens-for-api-requests

  const issuerId = await getConfigValue<string>(
    'feastAppleStoreKitConfigIssuerId',
  );
  console.log(`[32ff1faa] issuerId: ${issuerId}`);

  const keyId = await getConfigValue<string>('feastAppleStoreKitConfigKeyId');
  console.log(`[85c9b1e7] keyId: ${keyId}`);

  const audience = await getConfigValue<string>(
    'feastAppleStoreKitConfigAudience',
  );
  console.log(`[8b3ae72e] audience: ${audience}`);

  const privateKey1 = await getConfigValue<string>(
    'feastAppleStoreKitConfigPrivateKey1',
  );

  const jwt_headers = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT',
  };

  const unixtime = Math.floor(Date.now() / 1000);

  const jwt_payload = {
    iss: issuerId,
    iat: unixtime,
    exp: unixtime + 3600, // one hour expiration
    aud: audience,
    bid: appBundleId,
  };

  const token = jwt.sign(jwt_payload, privateKey1, {
    header: jwt_headers,
  }) as string;

  return token;
};