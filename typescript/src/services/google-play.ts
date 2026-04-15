import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Stage } from '../utils/appIdentity';
import * as aws from '../utils/aws';
import { restClient } from '../utils/restClient';

export const GOOGLE_PAYMENT_STATE = {
	PAYMENT_PENDING: 0,
	PAYMENT_RECEIVED: 1,
	FREE_TRIAL: 2,
	PENDING: 3,
};

export interface AccessToken {
	token: string;
	date: Date;
}

function getParams(stage: string) {
	return {
		Bucket: 'gu-mobile-access-tokens',
		Key: `${stage}/google-play-developer-api/access_token.json`,
	};
}

async function getAccessToken(stage: string): Promise<AccessToken> {
	const params = getParams(stage);

	try {
		const command = new GetObjectCommand(params);
		const s3Output = await aws.s3.send(command);

		if (!s3Output.Body) {
			throw Error('S3 output body was not defined');
		}

		// Convert the body to string
		const bodyString = await s3Output.Body.transformToString();
		return JSON.parse(bodyString) as AccessToken;
	} catch (error: unknown) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.log(`Failed to get access token from S3 due to: ${errorMessage}`);
		throw error;
	}
}

function buildGoogleUrl(
	subscriptionId: string,
	purchaseToken: string,
	packageName: string,
) {
	const baseUrl = `https://www.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions`;
	return `${baseUrl}/${subscriptionId}/tokens/${purchaseToken}`;
}

export interface GoogleResponseBody {
	startTimeMillis: string;
	expiryTimeMillis: string;
	userCancellationTimeMillis: string;
	autoRenewing: boolean;
	paymentState: 0 | 1 | 2 | 3;
}

export async function fetchGoogleSubscription(
	subscriptionId: string,
	purchaseToken: string,
	packageName: string,
): Promise<GoogleResponseBody | null> {
	const url = buildGoogleUrl(subscriptionId, purchaseToken, packageName);
	const accessToken = await getAccessToken(Stage);
	const response = await restClient.get<GoogleResponseBody>(url, {
		additionalHeaders: { Authorization: `Bearer ${accessToken.token}` },
	});
	return response.result;
}
