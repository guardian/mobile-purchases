import { FeastSQSEvent, FeastSQSRecord } from './models'
import { Subscription } from "../../models/subscription";

const processSQSRecord = async (record: FeastSQSRecord): Promise<void> => {
    console.log(`[48bb04a0] calling processRecord (Google version) with record ${JSON.stringify(record)}`);
    const subscription: Subscription = JSON.parse(record.body);
    console.log(`[2ba4a5a7] subscription: ${JSON.stringify(subscription)}`);
}

export const handler = async (event: FeastSQSEvent): Promise<void> => {
    console.log('[e01d21bb] Feast Google Acquisition Events Lambda has been called');
    console.log(`[8b8b51a5] Processing ${event.Records.length} records`);
    event.Records.map( async record => await processSQSRecord(record) );
}