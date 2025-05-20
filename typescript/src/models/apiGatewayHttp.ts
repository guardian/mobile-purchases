import type { APIGatewayProxyResult } from 'aws-lambda';

export type QueryParameters = Record<string, string>;

export type PathParameters = Record<string, string | undefined>;

export type HttpRequestHeaders = Record<string, string | undefined>;

export const HTTPResponses: Record<string, APIGatewayProxyResult> = {
    OK: { statusCode: 200, body: '{"status": 200, "message": "OK"}' },
    INVALID_REQUEST: {
        statusCode: 400,
        body: '{"status": 400, "message": "INVALID_REQUEST"}',
    },
    UNAUTHORISED: {
        statusCode: 401,
        body: '{"status": 401, "message": "UNAUTHORISED"}',
    },
    FORBIDDEN: {
        statusCode: 403,
        body: '{"status": 403, "message": "FORBIDDEN"}',
    },
    NOT_FOUND: {
        statusCode: 404,
        body: '{"status": 404, "message": "NOT_FOUND"}',
    },
    INTERNAL_ERROR: {
        statusCode: 500,
        body: '{"status": 500, "message": "INTERNAL_SERVER_ERROR"}',
    },
};
