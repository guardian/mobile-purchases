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

    const today = new Date()
    const subscriptionExpiryDate = new Date(today.setMonth(today.getMonth() + 1))

    const responseBody: SubscriptionStatusResponse = {
        "subscriptionHasLapsed": false,
        "subscriptionExpiryDate": subscriptionExpiryDate
    }

    console.log("Returning a stub 200 response")

    // We are returning a stubbed response as a temporary workaround to a rate limit issue that
    // is currently causing a production incident for our Android subscribers.
    return { statusCode: 200, body: JSON.stringify(responseBody) }
}
