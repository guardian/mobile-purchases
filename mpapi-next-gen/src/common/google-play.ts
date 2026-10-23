import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Stage, Region } from '../common/appIdentity';
import { restClient } from '../common/restClient';

const s3 = new S3Client({
	region: Region,
});

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

function getAccessToken(params: {
	Bucket: string;
	Key: string;
}): Promise<AccessToken> {
	const command = new GetObjectCommand(params);

	return s3
		.send(command)
		.then(async (s3Output) => {
			if (s3Output.Body) {
				// Convert the v3 stream payload back into a string
				const bodyString = await s3Output.Body.transformToString();
				return JSON.parse(bodyString);
			} else {
				throw Error('S3 output body was not defined');
			}
		})
		.catch((error) => {
			console.log(`Failed to get access token from S3 due to: ${error}`);
			throw error;
		});
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
	const accessToken = await getAccessToken(getParams(Stage));
	const response = await restClient.get<GoogleResponseBody>(url, {
		additionalHeaders: { Authorization: `Bearer ${accessToken.token}` },
	});
	return response.result;
}
