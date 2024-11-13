import { FeastSQSEvent, FeastSQSRecord } from './models'

const processSQSRecord = async (record: FeastSQSRecord): Promise<void> => {
    console.log(`[98b8aa43] calling processRecord (Apple version) with record ${JSON.stringify(record)}`);
    const subscriptionId = record.body.subscriptionId;
    const platform = record.body.platform ?? 'missing platform definition';
    console.log(`Feast Apple Acquisition Events Lambda has been called for subscriptionId: ${subscriptionId} with platform: ${platform}`);
}

export const handler = async (event: FeastSQSEvent): Promise<void> => {
    console.log('[0a06c521] Feast Apple Acquisition Events Lambda has been called');
    console.log(`[d9a1beb1] Processing ${event.Records.length} records`);
    event.Records.map( async record => await processSQSRecord(record) );
}