import type {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    // placeholder for new lambda
    console.log(`${JSON.stringify(request)}`)
    return { statusCode: 200, body: JSON.stringify(request) }
}