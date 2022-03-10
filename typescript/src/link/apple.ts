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

function deduplicate<T, U>(list: T[], selector: (item: T) => U): T[] {
    return list.reduce<T[]>(
        (agg, item) =>
            agg.some((x) => selector(x) == selector(item)) ?
                agg : agg.concat([item]), 
        []
    )
}

export function parseAppleLinkPayload(request: APIGatewayProxyEvent): AppleLinkPayload {
    const parsed = JSON.parse(request.body ?? "") as AppleLinkPayload;
    return {
        ...parsed,
        subscriptions: deduplicate(parsed.subscriptions, x => x.originalTransactionId)
    }
}

function toUserSubscription(userId: string, payload: AppleLinkPayload): UserSubscription[] {
    const now = new Date().toISOString()
    return payload.subscriptions.map(sub => new UserSubscription(
        userId,
        sub.originalTransactionId,
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
