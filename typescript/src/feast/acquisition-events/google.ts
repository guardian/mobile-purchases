import { FeastSQSEvent, FeastSQSRecord } from './models'
import { Subscription } from "../../models/subscription";

const processSQSRecord = async (record: FeastSQSRecord): Promise<void> => {
    console.log(`[48bb04a0] calling processRecord (Google version) with record ${JSON.stringify(record)}`);
    const subscription: Subscription = JSON.parse(record.body);
    const subscriptionId = subscription.subscriptionId ?? 'missing subscriptionId';
    const platform = subscription.platform ?? 'missing platform definition';
    console.log(`Feast Google Acquisition Events Lambda has been called for subscriptionId: ${subscriptionId} with platform: ${platform}`);
}

export const handler = async (event: FeastSQSEvent): Promise<void> => {
    console.log('[e01d21bb] Feast Google Acquisition Events Lambda has been called');
    console.log(`[8b8b51a5] Processing ${event.Records.length} records`);
    event.Records.map( async record => await processSQSRecord(record) );
}