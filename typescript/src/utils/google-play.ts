import S3 = require("aws-sdk/clients/s3")
import {HttpRequestHeaders} from "../models/apiGatewayHttp";

const s3: S3  = new S3();

export function getParams(stage: String): S3.Types.GetObjectRequest {
  return {
      Bucket: "gu-mobile-access-tokens",
      Key: `${stage}/google-play-developer-api/access_token.json`
  }
}

export function getAccessToken(params: S3.Types.GetObjectRequest) {
    console.log(`Attempting to fetch access token from: Bucket: ${params.Bucket} | Key: ${params.Key}`);
    return s3.getObject(params).promise()
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

export function buildGoogleUrl(headers: HttpRequestHeaders) {
    return

}
