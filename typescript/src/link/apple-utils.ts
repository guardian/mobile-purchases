import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Platform} from "../models/platform";

type AppleSubscription = {
    receipt: string
    originalTransactionId: string
}

export type AppleLinkPayload = {
    platform: Platform.DailyEdition | Platform.Ios | Platform.IosPuzzles | Platform.IosEdition | Platform.IosFeast,
    subscriptions: AppleSubscription[]
}

function deduplicate<T, U>(list: T[], selector: (item: T) => U): T[] {
    return list.reduce<T[]>(
        (agg, item) =>
            agg.some((x) => selector(x) === selector(item)) ?
                agg : agg.concat([item]), 
        []
    )
}

export function parseAppleLinkPayload(request: APIGatewayProxyEvent): AppleLinkPayload {
    const parsed = JSON.parse(request.body ?? "");

    const subscriptions = Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [parsed.subscriptions];

    return {
        ...parsed,
        subscriptions: deduplicate(subscriptions, x => x.originalTransactionId)
    } as AppleLinkPayload;
}
