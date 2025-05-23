import type { APIGatewayProxyEvent } from 'aws-lambda';
import { APIGatewayProxyResult } from 'aws-lambda';
import type { Platform } from '../models/platform';

type AppleSubscription = {
    receipt: string;
    originalTransactionId: string;
};

export type AppleLinkPayload = {
    platform:
        | Platform.DailyEdition
        | Platform.Ios
        | Platform.IosPuzzles
        | Platform.IosEdition
        | Platform.IosFeast;
    subscriptions: AppleSubscription[];
};

function deduplicate<T, U>(list: T[], selector: (item: T) => U): T[] {
    return list.reduce<T[]>(
        (agg, item) => (agg.some((x) => selector(x) === selector(item)) ? agg : agg.concat([item])),
        [],
    );
}

export function parseAppleLinkPayload(request: APIGatewayProxyEvent): AppleLinkPayload {
    const parsed = JSON.parse(request.body ?? '') as AppleLinkPayload;
    return {
        ...parsed,
        subscriptions: deduplicate(parsed.subscriptions, (x) => x.originalTransactionId),
    };
}
