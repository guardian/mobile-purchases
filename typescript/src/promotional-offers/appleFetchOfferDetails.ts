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
    signature: string,
    message: string
}

async function payloadToResponse(payload: HttpRequestPayload): Promise<Response> {

    // https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/subscriptions_and_offers/generating_a_signature_for_promotional_offers
    // appBundleId         : (from ssm parameter store)
    // keyIdentifier       : (from ssm parameter store)
    // productIdentifier   : (from request payload)
    // offerIdentifier     : (from request payload)
    // applicationUsername : (from request payload as username)
    // nonce               : (server generated)
    // timestamp           : (server generated)

    
    // Notes:
    //
    //   1. The appBundleId is stored in parameter store because it's different in
    //      CODE and PROD, but should be fairly stable.
    //
    //   2. The private key can be regenerated by one of the apps developers.
    //
    //   3. At the moment we are using the same key for CODE and PROD, but the code is written
    //      to allow for them to be different.
    //
    //   4. If one day a key needs to be replaced, then both the key and its keyIdentifier will
    //      have to be updated in AWS.

    const appBundleId = await getConfigValue<string>("promotional-offers-appBundleId");
    const keyIdentifier = await getConfigValue<string>("promotional-offers-keyIdentifier");
    const productIdentifier = payload.productIdentifier;
    const offerIdentifier = payload.offerIdentifier;
    const applicationUsername = payload.username.toLowerCase(); // aka: appAccountToken (in the apple documentation)
    const nonce = "29d5583d-1167-4868-850e-433eef45fbaa"; // (temporary) crypto.randomUUID().toLowerCase();
    const timestamp = Date.now();

    const separator = '\u2063';

    const message = appBundleId + separator + keyIdentifier + separator + productIdentifier + separator + offerIdentifier + separator + applicationUsername + separator + nonce + separator + timestamp;

    const data = Buffer.from(message, 'utf8');
    const privateKey1 = await getConfigValue<string>("promotional-offers-encryption-private-key");
    const privateKey2 = crypto.createPrivateKey({ key: privateKey1 });
    const signature = crypto.sign("SHA256", data , privateKey2);

    return {
        nonce: nonce,
        timestamp: timestamp,
        keyIdentifier: keyIdentifier,
        signature: signature.toString('base64'),
        message: message
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
        console.log("error while computing response: " + error);
        const answer = {
            statusCode: 500,
            body: "error while computing response"
        }
        return Promise.resolve(answer);
    }

}
