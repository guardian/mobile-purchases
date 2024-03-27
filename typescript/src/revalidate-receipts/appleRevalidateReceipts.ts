import {plusDays, plusHours} from "../utils/dates";
import {dynamoMapper, sendToSqs} from "../utils/aws";
import {EndTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {
    AndExpression,
    attributeExists,
    equals, greaterThan, lessThan,
} from '@aws/dynamodb-expressions';
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import { Platform } from "../models/platform";

function endTimestampForQuery(event: ScheduleEvent): Date {
    if (event.endTimestampFilter) {
        return new Date(Date.parse(event.endTimestampFilter));
    } else {
        return plusHours(new Date(), 13);
    }
}

function startTimestampForQuery(event: ScheduleEvent): Date {
    if (event.startTimestampFilter) {
        return new Date(Date.parse(event.startTimestampFilter));
    } else {
        return plusDays(new Date(), -60);
    }
}

interface ScheduleEvent {
    endTimestampFilter?: string
    startTimestampFilter?: string
}

const queueUrlForPlatform =
    (platform: string): string => {
        const LiveAppSqsUrl = process.env.LiveAppSqsUrl;
        if (LiveAppSqsUrl === undefined) throw new Error("No LiveAppSqsUrl env parameter provided");

        const FeastAppSqsUrl = process.env.FeastAppSqsUrl;
        if (FeastAppSqsUrl === undefined) throw new Error("No FeastAppSqsUrl env parameter provided");

        switch (platform) {
            case Platform.IosFeast:
                return FeastAppSqsUrl;
            default:
                return LiveAppSqsUrl;
        }
    }

export async function handler(event: ScheduleEvent) {
    const startTimestamp = startTimestampForQuery(event).toISOString();
    const endTimestamp = endTimestampForQuery(event).toISOString();
    console.log(`Will filter subscriptions before ${endTimestamp}`);

    const filter: AndExpression = {
        type: 'And',
        conditions: [
            {
                ...equals(true),
                subject: 'autoRenewing'
            },
            {
                ...attributeExists(),
                subject: 'receipt'
            },
            {
                ...lessThan(endTimestamp),
                subject: 'endTimestamp'
            },
            {
                ...greaterThan(startTimestamp),
                subject: 'endTimestamp'
            }
        ]
    };

    const queryScan = dynamoMapper.scan(
        EndTimeStampFilterSubscription,
        {
            indexName: 'ios-endTimestamp-revalidation-index-with-platform',
            filter: filter
        });

    let sentCount = 0;
    for await (const subscription of queryScan) {
        const receipt: string | undefined = subscription.receipt;
        if (receipt) {
            const subscriptionReference: AppleSubscriptionReference = {receipt: receipt};
            const delayInSeconds = Math.min(Math.floor(sentCount / 10), 900);
            const sqsUrl = queueUrlForPlatform(subscription.platform);
            await sendToSqs(sqsUrl, subscriptionReference, delayInSeconds);
            sentCount++;
            console.log(`Sent subscription with id: ${subscription.subscriptionId} and expiry timestamp: ${subscription.endTimestamp}`)
        } else {
            console.warn(`No receipt found for ${subscription.subscriptionId}`);
        }
    }
    console.log(`Sent ${sentCount} non-Feast subscriptions to be re-validated.`)
}
