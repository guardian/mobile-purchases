import {HTTPRequest, HTTPResponse, HTTPResponses} from "../models/apiGatewayHttp";
import {DeveloperNotification} from "./developerNotification";

function parsePayload(body?: string): Error | DeveloperNotification {
    try {
        let rawNotification = Buffer.from(JSON.parse(body || "").message.data, 'base64');
        let notification = JSON.parse(rawNotification.toString()) as DeveloperNotification;
        return notification;
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e;
    }
}

async function catchingServerErrors(block: () => Promise<HTTPResponse>): Promise<HTTPResponse> {
    try {
        return block();
    } catch (e) {
        console.error("Internal server error", e);
        return HTTPResponses.INTERNAL_ERROR
    }
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    const secret = process.env.Secret;
    return catchingServerErrors(async () => {
        if (request.queryStringParameters && request.queryStringParameters.secret === secret) {
            const notification = parsePayload(request.body);
            if (notification instanceof Error) {
                return HTTPResponses.INVALID_REQUEST
            }

            console.log(notification);

            return HTTPResponses.OK;
        } else {
            return HTTPResponses.UNAUTHORISED
        }
    });

}


