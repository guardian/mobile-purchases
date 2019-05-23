
const secret = process.env.Secret;

interface QueryParameters {
    secret: string
}

interface HTTPRequest {
    body: string
    queryStringParameters: QueryParameters
}

class HTTPHeaders {
    "Content-Type": string = "application/json";
    constructor() {}
}

class HTTPResponse {
    statusCode: number;
    headers: HTTPHeaders;
    body: string;

    constructor(statusCode: number, headers: HTTPHeaders, body: string) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.body = body;
    }
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    if (request.queryStringParameters.secret === secret) {
        return new HTTPResponse(200, new HTTPHeaders(), "OK")
    } else {
        return new HTTPResponse(500, new HTTPHeaders(), "Server Error")
    }
}


