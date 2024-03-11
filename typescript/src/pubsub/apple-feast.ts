import {APIGatewayProxyEvent} from "aws-lambda";

export async function handler(request: APIGatewayProxyEvent)  {
    console.log(JSON.stringify(request));
}