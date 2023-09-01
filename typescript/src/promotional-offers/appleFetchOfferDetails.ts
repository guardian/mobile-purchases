import 'source-map-support/register'
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import { HTTPResponses } from '../models/apiGatewayHttp';

interface HttpRequestPayload {
    username: string,
    productIdentifier: string,
    offerIdentifier: string
}

interface Response {
    nonce: string,
    timestamp: number,
    keyIdentifier: string,
    signature: string
}

function payloadToResponse(payload: HttpRequestPayload): Response {
    return {
        nonce: "c5b21eae-81e4-4b4a-be81-13cb5853984d",
        timestamp: 1693478012,
        keyIdentifier: "339f60b9af61",
        signature: "284A0C2BCFEF44809BAC4C286708DA51"
    };
} 

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    const requestBody = request.body;
    const payloadObject = JSON.parse(requestBody ?? "");
    try {
        const responseObject = payloadToResponse(payloadObject);
        const answer = {
            statusCode: 200,
            body: JSON.stringify(responseObject)
        }
        return Promise.resolve(answer);
    } catch (error) {
        const answer = {
            statusCode: 500,
            body: "error while computing response"
        }
        return Promise.resolve(answer);
    }

}
