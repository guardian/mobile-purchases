import {s3 as s3Client} from "../utils/aws"
import S3 from 'aws-sdk/clients/s3'

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
    return s3Client.getObject(params).promise()
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

