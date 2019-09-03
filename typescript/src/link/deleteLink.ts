import 'source-map-support/register'
import {DynamoDBStreamEvent} from "aws-lambda";

export async function handler(parameter: DynamoDBStreamEvent): Promise<any> {
    console.log(parameter);
    return parameter;
}