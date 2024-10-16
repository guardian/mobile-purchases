import { FeastSQSEvent, FeastSQSRecord } from './models'

export const handler = async (event: FeastSQSEvent): Promise<string[]> => {
    const recordDetails = event.Records.flatMap(
        async record => {
            const subscriptionId = record.body.subscriptionId;
            const platform = record.body.platform ?? 'missing platform definition';
            return (`Feast Google Acquisition Events Lambda has been called for subscriptionId: ${subscriptionId} with platform: ${platform}`);
        });
    return await Promise.all<string>(recordDetails);
}