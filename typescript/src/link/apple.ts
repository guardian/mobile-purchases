import 'source-map-support/register'
import {Platform} from "../models/platform";
import {parseAndStoreLink, SubscriptionCheckData} from "./link";
import {UserSubscription} from "../models/userSubscription";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

type AppleSubscription = {
    receipt: string
    originalTransactionId: string
}

type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios | Platform.IosPuzzles | Platform.IosEdition,
    subscriptions: AppleSubscription[]
}

function parseAppleLinkPayload(request: APIGatewayProxyEvent): AppleLinkPayload {
    return JSON.parse(request.body ?? "") as AppleLinkPayload;
}

function toUserSubscription(userId: string, payload: AppleLinkPayload): UserSubscription[] {
    const now = new Date().toISOString()
    const originalTransactionIds = payload.subscriptions.map(sub => sub.originalTransactionId)
    return Array.from(new Set(originalTransactionIds)).map((originalTransactionId) => new UserSubscription(
        userId,
        originalTransactionId,
        now
    ));
}

function toSqsPayload(payload: AppleLinkPayload): SubscriptionCheckData[] {
    return payload.subscriptions.map(sub => ({
        subscriptionId: sub.originalTransactionId,
        subscriptionReference: {
            receipt: sub.receipt
        }
    }))
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return parseAndStoreLink(
        httpRequest,
        parseAppleLinkPayload,
        toUserSubscription,
        toSqsPayload
    )
}
