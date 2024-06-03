import { SQSEvent } from "aws-lambda";

export function buildHandler(): (event: SQSEvent) => void {
    return (event: SQSEvent) => {
        console.log("Received SQS event:", event)
    }
}

export const handler = buildHandler();
