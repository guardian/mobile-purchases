import 'source-map-support/register';
import { parseStoreAndSend } from './pubsub';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
	fetchMetadata,
	parsePayload,
	toDynamoEvent,
	toSqsSubReference,
} from './google-common';

export async function handler(
	request: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
	return parseStoreAndSend(
		request,
		parsePayload,
		toDynamoEvent,
		toSqsSubReference,
		fetchMetadata,
	);
}
