import * as restm from 'typed-rest-client/RestClient';
import {
    HTTPResponseHeaders,
    HTTPRequest,
    HTTPResponse,
    HTTPResponses,
    HttpRequestHeaders,
    PathParameters
} from '../models/apiGatewayHttp';
import S3 = require("aws-sdk/clients/s3");

interface GoogleResponseBody {
    expiryTimeMillis: string
}

interface AccessToken {
    token: string,
    date: Date
}

interface SubscriptionStatusResponse {
    "subscriptionHasLapsed": boolean
    "subscriptionExpiryDate": Date
}

const s3: S3 = new S3();

function getParams(stage: string): S3.Types.GetObjectRequest {
    return {
        Bucket: 'gu-mobile-access-tokens',
        Key: `${stage}/google-play-developer-api/access_token.json`
    }
}

function getAccessToken(params: S3.Types.GetObjectRequest): Promise<AccessToken> {
    console.log(`Attempting to fetch access token from: Bucket: ${params.Bucket} | Key: ${params.Key}`);
    return s3.getObject(params).promise()
        .then(s3Output => {
            if (s3Output.Body) {
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

function getPurchaseToken(headers: HttpRequestHeaders): string {
    return headers["Play-Purchase-Token"] || headers["play-purchase-token"]
}

function buildGoogleUrl(pathParams: PathParameters, headers: HttpRequestHeaders) {
    const baseUrl = 'https://www.googleapis.com/androidpublisher/v3/applications/com.guardian/purchases/subscriptions';
    return `${baseUrl}/${pathParams.subscriptionId}/tokens/${getPurchaseToken(headers)}`;
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {

    const stage = process.env.Stage;

    if (request.pathParameters && request.headers && getPurchaseToken(request.headers)) {
        const restClient = new restm.RestClient('guardian-mobile-purchases');
        const url = buildGoogleUrl(request.pathParameters, request.headers);
        return getAccessToken(getParams(stage || ""))
            .then(accessToken =>
                restClient.get<GoogleResponseBody>(url, {additionalHeaders: {Authorization: `Bearer ${accessToken.token}`}})
            )
            .then(response => {
                if (response.result) {
                    const subscriptionExpiryDate: Date = new Date(parseInt(response.result.expiryTimeMillis));
                    const now: Date = new Date(Date.now());
                    const subscriptionHasLapsed: boolean = now > subscriptionExpiryDate;
                    const responseBody: SubscriptionStatusResponse = {"subscriptionHasLapsed": subscriptionHasLapsed, "subscriptionExpiryDate": subscriptionExpiryDate};
                    console.log(`Successfully retrieved subscription details from Play Developer API. Response body will be: ${JSON.stringify(responseBody)}`);
                    return new HTTPResponse(200, new HTTPResponseHeaders(), JSON.stringify(responseBody))
                } else {
                    console.log(`Failed to establish expiry time of subscription`);
                    return HTTPResponses.NOT_FOUND
                }
            })
            .catch(
                error => {
                    if (error['statusCode'] === 410) {
                        console.log(`Purchase expired a very long time ago`);
                        return HTTPResponses.NOT_FOUND
                    }
                    console.log(`Serving an Internal Server Error due to: ${error}`);
                    return HTTPResponses.INTERNAL_ERROR
                }
            );
    } else {
        return HTTPResponses.INVALID_REQUEST
    }



}