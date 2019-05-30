export interface QueryParameters {
    secret: string
}

export interface PathParameters {
    subscriptionId: string
}

export interface HttpRequestHeaders {
    "Play-Purchase-Token"?: string
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