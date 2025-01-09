import { APIGatewayProxyResult } from 'aws-lambda';

export interface QueryParameters {
	[key: string]: string;
}

export interface PathParameters {
	[key: string]: string | undefined;
}

export interface HttpRequestHeaders {
	[name: string]: string | undefined;
}

export const HTTPResponses: { [key: string]: APIGatewayProxyResult } = {
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
