import aws = require("../utils/aws");
import S3 from 'aws-sdk/clients/s3'
import { Stage } from "../utils/appIdentity";
import { restClient } from "../utils/restClient";

export const GOOGLE_PAYMENT_STATE = {
    PAYMENT_PENDING: 0,
    PAYMENT_RECEIVED: 1,
    FREE_TRIAL: 2,
    PENDING: 3
};

export interface AccessToken {
    token: string,
    date: Date
}

function getParams(stage: string): S3.Types.GetObjectRequest {
  return {
      Bucket: "gu-mobile-access-tokens",
      Key: `${stage}/google-play-developer-api/access_token.json`
  }
}

function getAccessToken(params: S3.Types.GetObjectRequest) : Promise<AccessToken> {
    return aws.s3.getObject(params).promise()
        .then( s3OutPut => {
            if(s3OutPut.Body) {
                return JSON.parse(s3OutPut.Body.toString())
            } else {
                throw Error("S3 output body was not defined")
            }
        })
        .catch( error => {
            console.log(`Failed to get access token from S3 due to: ${error}`);
            throw error
        })
}

function buildGoogleUrl(subscriptionId: string, purchaseToken: string, packageName: string) {
    const baseUrl = `https://www.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions`;
    return `${baseUrl}/${subscriptionId}/tokens/${purchaseToken}`;
}

export interface GoogleResponseBody {
    startTimeMillis: string,
    expiryTimeMillis: string,
    userCancellationTimeMillis: string,
    autoRenewing: boolean,
    paymentState: 0 | 1 | 2 | 3
}

export async function fetchGoogleSubscription(subscriptionId: string, purchaseToken: string, packageName: string): Promise<GoogleResponseBody | null> {
    const url = buildGoogleUrl(subscriptionId, purchaseToken, packageName);
    const accessToken = await getAccessToken(getParams(Stage));
    const response = await restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}});
    return response.result;
}
