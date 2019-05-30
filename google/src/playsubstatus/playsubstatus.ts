import * as restm from 'typed-rest-client/RestClient';
import {HTTPResponseHeaders, HTTPRequest, HTTPResponse} from '../models/apiGatewayHttp';

const access_token = process.env.AccessToken;

interface GoogleResponseBody {
    expiryTimeMillis: string
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {

    if (request.pathParameters && request.headers && request.headers["Play-Purchase-Token"]) {
        const url = `https://www.googleapis.com/androidpublisher/v3/applications/com.guardian/purchases/subscriptions/${request.pathParameters.subscriptionId}/tokens/${request.headers["Play-Purchase-Token"]}`;
        const restClient = new restm.RestClient('guardian-mobile-purchases');
        return restClient.get<GoogleResponseBody>(url, { additionalHeaders: { Authorization: `Bearer ${access_token}`}})
            .then(response => {
                if (response.result) {
                    const subscriptionExpiryDate: Date = new Date(parseInt(response.result.expiryTimeMillis));
                    const now: Date = new Date(Date.now());
                    const subscriptionHasLapsed: boolean = now > subscriptionExpiryDate;
                    console.log(`Subscription expires on: ${subscriptionExpiryDate}. subscriptionHasLapsed: ${subscriptionHasLapsed}`);
                    return new HTTPResponse(200, new HTTPResponseHeaders(), "OK")
                } else {
                    console.log(`Failed to establish expiry time of subscription`);
                    return new HTTPResponse(400, new HTTPResponseHeaders(), "Error")
                }
            })
            .catch(
                error =>  {
                    console.log(`Error: ${error}`);
                    return new HTTPResponse(500, new HTTPResponseHeaders(), "Error")
                }
            );
    } else {
        return new HTTPResponse(400, new HTTPResponseHeaders(), "Bad Request")
    }



}