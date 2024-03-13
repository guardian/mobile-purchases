import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    console.log(`[34ef7aa3] ${JSON.stringify(request)}`)
    return { statusCode: 200, body: JSON.stringify(request) }
}