import type { DynamoDBStreamEvent } from 'aws-lambda';

export const handler = async (event: DynamoDBStreamEvent): Promise<String> => {
    const message: String = 'Feast Acquisition Events Router Lambda has been called';
    console.log(message)
    return message;
}