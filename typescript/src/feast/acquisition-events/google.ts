import type { SQSEvent } from 'aws-lambda';

export const handler = async (event: SQSEvent): Promise<String> => {
    const message: String = 'Feast Google Acquisition Events Lambda has been called';
    console.log(message)
    return message;
}