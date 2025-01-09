import 'source-map-support/register';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Platform } from '../models/platform';
import {
	AppleValidationResponse,
	validateReceipt,
} from '../services/appleValidateReceipts';
import { HTTPResponses } from '../models/apiGatewayHttp';
import { plusDays } from '../utils/dates';

interface AppleSubscription {
	receipt: string;
	originalTransactionId: string;
	clientSideValid?: boolean;
}

interface AppleLinkPayload {
	platform: Platform.DailyEdition | Platform.Ios | Platform.IosPuzzles;
	subscriptions: AppleSubscription[];
}

interface AppleSubscriptionStatusResponse {
	originalTransactionId: string;
	valid: boolean;
	autoRenewStatus: boolean;
	gracePeriod: boolean;
	trialPeriod: boolean;
	start: string;
	end: string;
	endWithGracePeriod: string;
	product: string;
	latestReceipt: string;
}

function toResponse(
	validationResponse: AppleValidationResponse,
): AppleSubscriptionStatusResponse {
	const now = new Date();

	const receiptInfo = validationResponse.latestReceiptInfo;
	const end = receiptInfo.expiresDate;
	const endWithGracePeriod = plusDays(end, 30);
	const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();
	const gracePeriod: boolean = now.getTime() > end.getTime() && valid;

	return {
		originalTransactionId: receiptInfo.originalTransactionId,
		valid: valid,
		autoRenewStatus: receiptInfo.autoRenewStatus,
		gracePeriod: gracePeriod,
		trialPeriod: receiptInfo.trialPeriod,
		start: receiptInfo.originalPurchaseDate.toISOString(),
		end: end.toISOString(),
		endWithGracePeriod: endWithGracePeriod.toISOString(),
		product: receiptInfo.productId,
		latestReceipt: validationResponse.latestReceipt,
	};
}

function logClientServerStatusDiff(
	responses: AppleSubscriptionStatusResponse[],
	requests: AppleSubscription[],
): void {
	for (const req of requests) {
		const resp = responses.find(
			(resp) => resp.originalTransactionId === req.originalTransactionId,
		);
		// if the server decide the subscription isn't valid, but the client has decided the subscription is valid
		if (!resp?.valid && req.clientSideValid === true) {
			console.warn(
				`Client thought ${req.originalTransactionId} was valid but server disagreed`,
			);
		}
	}
}

export async function handler(
	httpRequest: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
	let payload: AppleLinkPayload;
	try {
		payload = JSON.parse(httpRequest.body ?? '') as AppleLinkPayload;
	} catch (e) {
		return HTTPResponses.INVALID_REQUEST;
	}

	try {
		const validationResults = await Promise.all(
			payload.subscriptions.map((sub) =>
				validateReceipt(sub.receipt, { sandboxRetry: true }),
			),
		);
		const flattenedValidationResults = validationResults.reduce(
			(agg: AppleValidationResponse[], value) => agg.concat(value),
			[],
		);
		const calculatedResponse = flattenedValidationResults.map(toResponse);
		logClientServerStatusDiff(calculatedResponse, payload.subscriptions);
		const responsePayload = JSON.stringify(calculatedResponse);
		return { statusCode: 200, body: responsePayload };
	} catch (e) {
		console.log(`Unable to validate receipt(s)`, e);
		return HTTPResponses.INTERNAL_ERROR;
	}
}
