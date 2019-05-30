import {HTTPResponseHeaders, HTTPRequest, HTTPResponse} from '../apigateway/types';



export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    const secret = process.env.Secret;
    if (request.queryStringParameters && request.queryStringParameters.secret === secret) {
        return new HTTPResponse(200, new HTTPResponseHeaders(), "OK")
    } else {
        return new HTTPResponse(500, new HTTPResponseHeaders(), "Server Error")
    }
}


