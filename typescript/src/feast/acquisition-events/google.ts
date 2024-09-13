import type { SQSEvent } from 'aws-lambda';
import {buildHandler} from "../pubsub/google";

export const handler = async (event: SQSEvent): Promise<String> => {
    const message: String = 'Hello World';
    console.log(message)
    return message;
    // const eventualEnsuredIdentityAccount = event.Records.flatMap(
        // async (sqsRecord: SQSRecord) => {
        //     console.log(
        //         `Hello World`,
        //     );
        // });
    // await Promise.all<void>(eventualEnsuredIdentityAccount);
}