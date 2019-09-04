import 'source-map-support/register'
import {Platform} from "../models/platform";
import {parseAndStoreLink, SubscriptionCheckData} from "./link";
import {UserSubscription} from "../models/userSubscription";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

type GoogleSubscription = {
    purchaseToken: string
    subscriptionId: string
}

type GoogleLinkPayload = {
    platform: Platform.Android,
    subscriptions: GoogleSubscription[]
}

export function parseGoogleLinkPayload(request: APIGatewayProxyEvent): GoogleLinkPayload {
    return JSON.parse(request.body || "") as GoogleLinkPayload
}

function toUserSubscription(userId: string, payload: GoogleLinkPayload): UserSubscription[] {
    return payload.subscriptions.map(sub => new UserSubscription(
        userId,
        sub.purchaseToken,
        new Date().toISOString()
    ));
}

function toSqsPayload(payload: GoogleLinkPayload): SubscriptionCheckData[] {
    return payload.subscriptions.map(sub => ({
        subscriptionId: sub.purchaseToken,
        subscriptionReference: {
            packageName: "com.guardian",
            purchaseToken: sub.purchaseToken,
            subscriptionId: sub.subscriptionId
        }
    }))
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return parseAndStoreLink(
        httpRequest,
        parseGoogleLinkPayload,
        toUserSubscription,
        toSqsPayload
    )
}
