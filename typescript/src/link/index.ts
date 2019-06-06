import {HTTPRequest, HTTPResponse, HTTPResponses} from "../models/apiGatewayHttp";

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    return new Promise((success, failure) => {
       success(HTTPResponses.OK)
    });
}