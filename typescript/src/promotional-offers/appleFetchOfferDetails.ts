import 'source-map-support/register'
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import { HTTPResponses } from '../models/apiGatewayHttp';

interface HttpRequestPayload {
    username: string,
    productIdentifier: string,
    offerIdentifier: string
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    const requestBody = request.body;
    console.log("[a19489e1] " + requestBody);
    const payloadObject = JSON.parse(requestBody ?? "")
    console.log("[a19489e2] " + JSON.stringify(payloadObject));
    const answer = {
        statusCode: 200,
        body: JSON.stringify({
            nonce: "c5b21eae-81e4-4b4a-be81-13cb5853984d",
            timestamp: 1693478012,
            keyIdentifier: "339f60b9af61",
            signature: "284A0C2BCFEF44809BAC4C286708DA51"
        })
    }
    return Promise.resolve(answer);
}
