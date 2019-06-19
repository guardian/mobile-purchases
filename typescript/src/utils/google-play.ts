import S3 from 'aws-sdk/clients/s3'
import {CredentialProviderChain, ECSCredentials, SharedIniFileCredentials} from "aws-sdk";
import {Region} from "./appIdentity";

const credentialProvider = new CredentialProviderChain([
    function () { return new ECSCredentials(); },
    function () { return new SharedIniFileCredentials({
        profile: "mobile"
    }); }
]);

export const s3: S3  = new S3({
    region: Region ,
    credentialProvider: credentialProvider
});


export interface AccessToken {
    token: string,
    date: Date
}

export function getParams(stage: string): S3.Types.GetObjectRequest {
    return {
        Bucket: 'gu-mobile-access-tokens',
        Key: `${stage}/google-play-developer-api/access_token.json`
    }
}

export function getAccessToken(params: S3.Types.GetObjectRequest): Promise<AccessToken> {
    console.log(`Attempting to fetch access token from: Bucket: ${params.Bucket} | Key: ${params.Key}`);
    return s3.getObject(params).promise()
        .then(s3Output => {
            if (s3Output.Body) {
                console.log("Got Body")
                return JSON.parse(s3Output.Body.toString())
            } else {
                throw Error("S3 output body was not defined")
            }
        })
        .catch(error => {
            console.log(`Failed to get access token from S3 due to: ${error}`);
            throw error
        })
}

export function buildGoogleUrl(subscriptionId: String, purchaseToken: String, packageName: String) {
    const baseUrl = `https://www.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions`;
    return `${baseUrl}/${subscriptionId}/tokens/${purchaseToken}`;
}

