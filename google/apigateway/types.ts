export interface QueryParameters {
    secret: string
}

export interface PathParameters {
    subscriptionId: string,
    purchaseToken: string
}

export interface HTTPRequest {
    body: string
    queryStringParameters?: QueryParameters
    pathParameters?: PathParameters
}

export class HTTPHeaders {
    "Content-Type": string = "application/json";
    constructor() {}
}

export class HTTPResponse {
    statusCode: number;
    headers: HTTPHeaders;
    body: string;

    constructor(statusCode: number, headers: HTTPHeaders, body: string) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.body = body;
    }
}