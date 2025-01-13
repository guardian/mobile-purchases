import type { androidpublisher_v3 } from '@googleapis/androidpublisher';
import { androidpublisher, auth } from '@googleapis/androidpublisher';
import SSM = require('aws-sdk/clients/ssm');
import { GoogleAuth } from 'google-auth-library';

export const ssm: SSM = new SSM({
  region: 'eu-west-1',
});

const getConfigValue = (): Promise<string> => {
  return ssm
    .getParameter({
      Name: '/mobile-purchase/android-subscription/google.serviceAccountJson2',
      WithDecryption: true,
    })
    .promise()
    .then((result) => {
      return result.Parameter?.Value ?? '{}';
    });
};

export const getClient =
  async (): Promise<androidpublisher_v3.Androidpublisher> => {
    return getConfigValue()
      .then((raw) => {
        return JSON.parse(raw);
      })
      .then(async (serviceAccountJson) => {
        const jsonClient = new GoogleAuth({
          credentials: serviceAccountJson,
          scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });
        const accessToken = await jsonClient.getAccessToken();
        const authClient = new auth.OAuth2({
          credentials: { access_token: accessToken },
        });

        return androidpublisher({
          version: 'v3',
          auth: authClient,
        });
      });
  };
