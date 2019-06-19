import aws = require("../utils/aws");

import S3 from 'aws-sdk/clients/s3'

export interface AccessToken {
    token: string,
    date: Date
}

export function getParams(stage: String): S3.Types.GetObjectRequest {
  return {
      Bucket: "gu-mobile-access-tokens",
      Key: `${stage}/google-play-developer-api/access_token.json`
  }
}

export function getAccessToken(params: S3.Types.GetObjectRequest) : Promise<AccessToken> {
    console.log(`Attempting to fetch access token from: Bucket: ${params.Bucket} | Key: ${params.Key}`);
    const token =  aws.s3.getObject(params).promise()
        .then( s3OutPut => {
            if(s3OutPut.Body) {
                console.log("Got access tk");

                return JSON.parse(s3OutPut.Body.toString())
            } else {
                console.log("token errod");

                throw Error("S3 output body was not defined")
            }
        })
        .catch( error => {
            console.log(`Failed to get access token from S3 due to: ${error}`);
            throw error
        })
    console.log("Hello")
    return token
}

export function buildGoogleUrl(subscriptionId: String, purchaseToken: String, packageName: String) {
    const baseUrl = `https://www.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions`;
    return `${baseUrl}/${subscriptionId}/tokens/${purchaseToken}`;
}

