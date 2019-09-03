import 'source-map-support/register'
import {DynamoDBStreamEvent} from "aws-lambda";

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
    const ttlEvents = event.Records.filter(dynamoEvent => {
        return dynamoEvent.eventName == "REMOVE" &&
            dynamoEvent.userIdentity &&
            dynamoEvent.userIdentity.type == "Service" &&
            dynamoEvent.userIdentity.principalId == "dynamodb.amazonaws.com"
    });
    console.log(JSON.stringify(ttlEvents));
    return event;
}