import 'source-map-support/register'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { HTTPResponses } from '../models/apiGatewayHttp';
import * as crypto from "crypto";
import { getConfigValue } from "../utils/ssmConfig";

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

async function payloadToResponse(payload: HttpRequestPayload): Promise<Response> {

    // https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/subscriptions_and_offers/generating_a_signature_for_promotional_offers
    // appBundleId         :
    // keyIdentifier       :
    // productIdentifier   : (from request payload)
    // offerIdentifier     : (from request payload)
    // applicationUsername : (from request payload as username)
    // nonce               : (server generated)
    // timestamp           : (server generated)

    // release: uk.co.guardian.iphone2
    // debug  : uk.co.guardian.iphone2.debug

    const appBundleId = 'uk.co.guardian.iphone2.debug';
    const keyIdentifier = 'PGRFM5F82T';
    const productIdentifier = payload.productIdentifier;
    const offerIdentifier = payload.offerIdentifier;
    const applicationUsername = payload.username;
    const nonce = crypto.randomUUID().toLowerCase();
    const timestamp = Date. now(); // generates the currenty unixtime in milliseconds

    const str1 = appBundleId + '\u2063' + keyIdentifier + '\u2063' + productIdentifier + '\u2063' + offerIdentifier + '\u2063' + applicationUsername + '\u2063' + nonce + '\u2063' + timestamp;

    const data = Buffer.from(str1, 'utf8');
    const privateKey1 = await getConfigValue<string>("promotional-offers-encryption-private-key");
    const privateKey2 = crypto.createPrivateKey({ key: privateKey1 });
    const signature = crypto.sign("SHA256", data , privateKey2);

    return {
        nonce: nonce,
        timestamp: timestamp,
        keyIdentifier: keyIdentifier,
        signature: signature.toString('base64')
    };
} 

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {

    const requestBody = request.body;
    const payloadObject = JSON.parse(requestBody ?? "");
    try {
        const responseObject = await payloadToResponse(payloadObject);
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
