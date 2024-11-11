import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
    console.log('[c9900d41] Feast Acquisition Events Router Lambda has been called');

    const records = event.Records; // retrieve records from DynamoDBStreamEvent

    let processedCount = 0;

    const processRecordPromises = records.map(async (record: DynamoDBRecord) => {
        console.log(`Processing: record: ${JSON.stringify(record)}`);
        const eventName = record.eventName;
        const identityId = record?.dynamodb?.NewImage?.userId?.S || "";
        const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S || "";
        console.log(`Processing: ${eventName} record for identityId: ${identityId} and subscriptionId: ${subscriptionId}`);
        processedCount ++;
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${processedCount} records from DynamoDBStreamEvent`);
}