import {SQSEvent} from "aws-lambda";

export async function handler(event: SQSEvent) {
    console.log(JSON.stringify(event));
}