import { DynamoDBStreamEvent } from "aws-lambda";

async function processAcquisition(record: any): Promise<void> {
    // pascals idapi code here
}

export async function acquisitionHandler(event: DynamoDBStreamEvent): Promise<any> {
    const records = event.Records;

    const processRecordPromises = records.map((record) => {
        const eventName = record.eventName;

        if (eventName === "INSERT") {
            return processAcquisition(record);
        }
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${records.length} newly inserted records from the link (insert full name) DynamoDB table`);
}