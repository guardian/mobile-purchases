import {plusHours} from "../utils/dates";
import {dynamoMapper, sendToSqs} from "../utils/aws";
import {EndTimeStampFilterSubscription} from "../models/endTimestampFilter";
import {
    AndExpression,
    attributeExists,
    equals, lessThan,
} from '@aws/dynamodb-expressions';
import {AppleSubscriptionReference} from "../models/subscriptionReference";

function endTimestampForQuery(event: ScheduleEvent): Date {
    const defaultDate = plusHours(new Date(), 13);
    if (event.endTimestampFilter) {
        return new Date(Date.parse(event.endTimestampFilter));
    } else {
        return defaultDate;
    }
}

interface ScheduleEvent {
    endTimestampFilter?: string;
}

export async function handler(event: ScheduleEvent) {
    const time = endTimestampForQuery(event).toISOString();
    console.log(`Will filter subscriptions before ${time}`);

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
                ...lessThan(time),
                subject: 'endTimestamp'
            }
        ]
    };

    const queryScan = dynamoMapper.scan(
        EndTimeStampFilterSubscription,
        {
            indexName: 'ios-endTimestamp-revalidation-index',
            filter: filter
        });

    const SqsUrl = process.env.SqsUrl;
    if (SqsUrl === undefined) throw new Error("No SqsUrl env parameter provided");

    for await (const subscription of queryScan) {
        const receipt: string | undefined = subscription.receipt;
        if (receipt) {
            const subscriptionReference: AppleSubscriptionReference = {receipt: receipt}
            await sendToSqs(SqsUrl, subscriptionReference);
        } else {
            console.warn(`No receipt found for ${subscription.subscriptionId}`);
        }
        console.log(`Found subscription with id: ${subscription.subscriptionId} and expiry timestamp: ${subscription.endTimestamp}`)
    }
}
