export interface QueryParameters {
    [key: string]: string
}

export interface PathParameters {
    [key: string]: string
}

export interface HttpRequestHeaders {
    [key: string]: string
}

export interface HTTPRequest {
    headers?: HttpRequestHeaders
    queryStringParameters?: QueryParameters
    pathParameters?: PathParameters
    body?: string
}

export class HTTPResponseHeaders {
    "Content-Type": string = "application/json";
    constructor() {}
}

export class HTTPResponse {
    statusCode: number;
    headers: HTTPResponseHeaders;
    body: string;

    constructor(statusCode: number, headers: HTTPResponseHeaders, body: string) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.body = body;
    }
}

export const HTTPResponses = {
    OK: new HTTPResponse(200, new HTTPResponseHeaders(), "{\"status\": 200, \"message\": \"OK\"}"),
    INVALID_REQUEST: new HTTPResponse(400, new HTTPResponseHeaders(), "{\"status\": 400, \"message\": \"INVALID_REQUEST\"}"),
    UNAUTHORISED: new HTTPResponse(401, new HTTPResponseHeaders(), "{\"status\": 401, \"message\": \"UNAUTHORISED\"}"),
    INTERNAL_ERROR: new HTTPResponse(500, new HTTPResponseHeaders(), "{\"status\": 500, \"message\": \"INTERNAL SERVER ERROR\"}")
};