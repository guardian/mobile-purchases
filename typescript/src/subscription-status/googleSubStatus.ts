import 'source-map-support/register'
import {
    HTTPResponses,
    HttpRequestHeaders,
    PathParameters
} from '../models/apiGatewayHttp';
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {fetchGoogleSubscription} from "../services/google-play";
import {optionalMsToDate} from "../utils/dates";
import {Option} from "../utils/option";

interface SubscriptionStatusResponse {
    "subscriptionHasLapsed": boolean
    "subscriptionExpiryDate": Date
}

function getPurchaseToken(headers: HttpRequestHeaders): string | undefined {
    return headers["Play-Purchase-Token"] ?? headers["play-purchase-token"];
}

function getSubscriptionId(parameters: PathParameters | null): string | undefined {
    return parameters?.subscriptionId;
}

function googlePackageName(headers: HttpRequestHeaders): string {
    const packageNameFromHeaders = headers["Package-Name"] ?? headers["package-name"];
    if (packageNameFromHeaders) {
        return packageNameFromHeaders;
    } else {
        return "com.guardian";
    }
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

    const purchaseToken = getPurchaseToken(request.headers);
    const subscriptionId = getSubscriptionId(request.pathParameters);
    if (purchaseToken && subscriptionId) {
        const packageName = googlePackageName(request.headers);
        console.log(`Searching for valid ${subscriptionId} subscription for Android app with package name: ${packageName}`);

        try {
            const subscription = await fetchGoogleSubscription(subscriptionId, purchaseToken, packageName);

            const subscriptionExpiryDate: Option<Date> = optionalMsToDate(subscription?.expiryTimeMillis);
            if (subscriptionExpiryDate !== null) {
                const now: Date = new Date(Date.now());
                const subscriptionHasLapsed: boolean = now > subscriptionExpiryDate;
                const responseBody: SubscriptionStatusResponse = {
                    "subscriptionHasLapsed": subscriptionHasLapsed,
                    "subscriptionExpiryDate": subscriptionExpiryDate
                };
                console.log(`Successfully retrieved subscription details from Play Developer API. Response body will be: ${JSON.stringify(responseBody)}`);
                return {statusCode: 200, body: JSON.stringify(responseBody)};
            } else {
                console.log(`Failed to establish expiry time of subscription`);
                return HTTPResponses.NOT_FOUND;
            }
        } catch (error) {
            if (error.statusCode === 410) {
                console.log(`Purchase expired a very long time ago`);
                return HTTPResponses.NOT_FOUND;
            } else {
                console.log(`Serving an Internal Server Error due to: ${error.toString().split('/tokens/')[0]}`);
                return HTTPResponses.INTERNAL_ERROR;
            }
        }
    } else {
        return HTTPResponses.INVALID_REQUEST;
    }

}
