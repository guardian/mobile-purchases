import { FeastSQSEvent, FeastSQSRecord } from './models'
import { Subscription } from "../../models/subscription";

const processSQSRecord = async (record: FeastSQSRecord): Promise<void> => {
    console.log(`[98b8aa43] calling processRecord (Apple version) with record ${JSON.stringify(record)}`);
    const subscription: Subscription = JSON.parse(record.body);
    const subscriptionId = subscription.subscriptionId ?? 'missing subscriptionId';
    const platform = subscription.platform ?? 'missing platform definition';
    console.log(`Feast Apple Acquisition Events Lambda has been called for subscriptionId: ${subscriptionId} with platform: ${platform}`);
}

export const handler = async (event: FeastSQSEvent): Promise<void> => {
    console.log('[0a06c521] Feast Apple Acquisition Events Lambda has been called');
    console.log(`[d9a1beb1] Processing ${event.Records.length} records`);
    event.Records.map( async record => await processSQSRecord(record) );
}