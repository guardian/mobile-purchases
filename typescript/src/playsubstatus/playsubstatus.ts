import * as restm from 'typed-rest-client/RestClient';
import {
    HTTPResponseHeaders,
    HTTPRequest,
    HTTPResponse,
    HTTPResponses,
    HttpRequestHeaders,
    PathParameters
} from '../models/apiGatewayHttp';
import {getParams, getAccessToken, buildGoogleUrl} from "../utils/google-play";
import S3 from 'aws-sdk/clients/s3'

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

function getPurchaseToken(headers: HttpRequestHeaders): string {
    return headers["Play-Purchase-Token"] || headers["play-purchase-token"]
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {

    const stage = process.env.Stage;
    const googlePackagename =  "com.guardian"

    if (request.pathParameters && request.headers && getPurchaseToken(request.headers)) {
        const restClient = new restm.RestClient('guardian-mobile-purchases');
        const purchaseToken = getPurchaseToken(request.headers)
        const url = buildGoogleUrl(request.pathParameters.subscriptionId, purchaseToken, googlePackagename);
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
                    if (error.statusCode === 410) {
                        console.log(`Purchase expired a very long time ago`);
                        return HTTPResponses.NOT_FOUND
                    } else {
                        console.log(`Serving an Internal Server Error due to: ${error}`);
                        return HTTPResponses.INTERNAL_ERROR
                    }
                }
            );
    } else {
        return HTTPResponses.INVALID_REQUEST
    }

}
