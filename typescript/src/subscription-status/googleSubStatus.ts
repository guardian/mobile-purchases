import 'source-map-support/register'
import * as restm from 'typed-rest-client/RestClient';
import {
    HTTPResponses,
    HttpRequestHeaders
} from '../models/apiGatewayHttp';
import {getParams, getAccessToken, buildGoogleUrl} from "../utils/google-play";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

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

function googlePackageName(headers: HttpRequestHeaders): string {
    const packageNameFromHeaders = headers["Package-Name"] || headers["package-name"];
    if (packageNameFromHeaders) {
        return packageNameFromHeaders
    } else {
        return "com.guardian";
    }
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

    const stage = process.env.Stage;

    if (request.pathParameters && request.headers && getPurchaseToken(request.headers)) {
        const restClient = new restm.RestClient('guardian-mobile-purchases');
        const purchaseToken = getPurchaseToken(request.headers);
        const packageName = googlePackageName(request.headers);
        const subscriptionId = request.pathParameters.subscriptionId;
        console.log(`Searching for valid ${subscriptionId} subscription for Android app with package name: ${packageName}`);
        const url = buildGoogleUrl(subscriptionId, purchaseToken, packageName);
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
                    return {statusCode: 200, body: JSON.stringify(responseBody)}
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
