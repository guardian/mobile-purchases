import type { DynamoDBStreamEvent } from 'aws-lambda';
import { Subscription } from '../common/subscription';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { Region, Stage } from '../common/appIdentity';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { SendMessageCommandOutput } from '@aws-sdk/client-sqs';
import { plusDays } from '../common/dates';
import { getMembershipAccountId } from '../common/guIdentityApi';
import { Platform } from '../common/platform';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { getIdentityApiKey, getIdentityUrl } from '../common/guIdentityApi';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// -----------------------------------------------------------------------------
// Types

type SoftOptInEventProductName = 'InAppPurchase' | 'FeastInAppPurchase';

interface SoftOptInEvent {
	identityId: string;
	eventType: 'Acquisition' | 'Cancellation' | 'Switch';
	productName: SoftOptInEventProductName;
	subscriptionId: string;
}

// -----------------------------------------------------------------------------
// Globals Variables

let SOISqsClient: SQSClient | undefined;
let lastAssumedSOI: Date | undefined;
let commsSqsClient: SQSClient | undefined;
let lastAssumedComms: Date | undefined;

// -----------------------------------------------------------------------------
// Clients Initialization

const dynamoClient = new DynamoDBClient({ region: Region });
const sqsClient = new SQSClient({ region: Region });

// -----------------------------------------------------------------------------
// Functions (Clients Initialization Only)

async function getSqsClientForComms(): Promise<SQSClient> {
	const now = new Date();
	if (
		!commsSqsClient ||
		!lastAssumedComms ||
		now.getTime() - lastAssumedComms.getTime() >= 1800000
	) {
		const membershipAccountId = await getMembershipAccountId();
		const stsClient = new STSClient({ region: Region });

		const assumeRoleResult = await stsClient.send(
			new AssumeRoleCommand({
				RoleArn: `arn:aws:iam::${membershipAccountId}:role/comms-${Stage}-EmailQueueCrossAccountRole`,
				RoleSessionName: 'CrossAccountSession',
			}),
		);

		const credentials = assumeRoleResult.Credentials;

		if (
			!credentials ||
			!credentials.AccessKeyId ||
			!credentials.SecretAccessKey
		) {
			throw Error('credentials undefined in getSqsClientForComms');
		}

		commsSqsClient = new SQSClient({
			region: Region,
			credentials: {
				accessKeyId: credentials.AccessKeyId,
				secretAccessKey: credentials.SecretAccessKey,
				sessionToken: credentials.SessionToken || '',
			},
		});

		lastAssumedComms = now;
	}

	return commsSqsClient;
}

async function getSqsClientForSoftOptIns(): Promise<SQSClient> {
	const now = new Date();
	if (
		!SOISqsClient ||
		!lastAssumedSOI ||
		now.getTime() - lastAssumedSOI.getTime() >= 1800000
	) {
		const membershipAccountId = await getMembershipAccountId();
		const stsClient = new STSClient({ region: Region });

		const softOptInConsentSetterStage = Stage === 'PROD' ? 'PROD' : 'CODE';

		const assumeRoleResult = await stsClient.send(
			new AssumeRoleCommand({
				RoleArn: `arn:aws:iam::${membershipAccountId}:role/membership-${softOptInConsentSetterStage}-soft-opt-in-consent-setter-QueueCrossAccountRole`,
				RoleSessionName: 'CrossAccountSession',
			}),
		);

		const credentials = assumeRoleResult.Credentials;

		if (
			!credentials ||
			!credentials.AccessKeyId ||
			!credentials.SecretAccessKey
		) {
			throw Error('credentials undefined in getSqsClientForSoftOptIns');
		}

		SOISqsClient = new SQSClient({
			region: Region,
			credentials: {
				accessKeyId: credentials.AccessKeyId,
				secretAccessKey: credentials.SecretAccessKey,
				sessionToken: credentials.SessionToken || '',
			},
		});

		lastAssumedSOI = now;
	}

	return SOISqsClient;
}

// -----------------------------------------------------------------------------
// Functions (Misc)

const mapPlatformToSoftOptInProductName = (
	platform: string | undefined,
): SoftOptInEventProductName => {
	switch (platform) {
		case Platform.IosFeast:
		case Platform.AndroidFeast:
			return 'FeastInAppPurchase';
		default:
			return 'InAppPurchase';
	}
};

function sendToSqs(
	queueUrl: string,
	event: unknown,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	return sqsClient.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			DelaySeconds: delaySeconds,
		}),
	);
}

async function handleError(message: string): Promise<never> {
	// We set adding a common marker to all messages handled by this function
	const m2 = `[8892291c] ${message}`;
	console.warn(m2);
	throw new Error(m2);
}

function isPostAcquisition(startTimestamp: string): boolean {
	const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;
	const today = new Date();
	const acquisitionDate = new Date(startTimestamp);
	return today.getTime() - acquisitionDate.getTime() >= twoDaysInMilliseconds;
}

async function getUserEmailAddress(
	identityId: string,
	identityApiKey: string,
): Promise<string> {
	const domain = await getIdentityUrl();
	const url = `${domain}/user/${identityId}`;

	const params = {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${identityApiKey}`,
		},
	};

	try {
		console.log(`[e2a4b432] url ${url}`);

		return fetch(url, params).then(async (response: Response) => {
			if (response.ok) {
				const json = (await response.json()) as {
					user?: {
						primaryEmailAddress?: string;
					};
				};

				if (!json.user || !json.user.primaryEmailAddress) {
					return await handleError(
						`[8973f68a] user or primaryEmailAddress is undefined for user ${identityId}`,
					);
				}

				return json.user.primaryEmailAddress;
			} else {
				return await handleError(
					`[0dce5329] could not fetch details from identity API for user ${identityId}`,
				);
			}
		});
	} catch (error) {
		return await handleError(
			`[3184ae21] error while retrieving user data for identityId: ${identityId}: ${JSON.stringify(
				error,
			)}`,
		);
	}
}

const buildBrazeEmailMessage = (
	emailAddress: string,
	identityId: string,
	platform: string | undefined,
) => {
	switch (platform) {
		case Platform.IosFeast:
		case Platform.AndroidFeast:
			return {
				To: {
					Address: emailAddress,
					ContactAttributes: { SubscriberAttributes: {} },
				},
				DataExtensionName: 'SV_FA_SOINotification',
				IdentityUserId: identityId,
			};
		default:
			return {
				To: {
					Address: emailAddress,
					ContactAttributes: { SubscriberAttributes: {} },
				},
				DataExtensionName: 'SV_PA_SOINotification',
				IdentityUserId: identityId,
			};
	}
};

async function sendToSqsComms(
	queueUrl: string,
	event: unknown,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	const membershipSqs = await getSqsClientForComms();
	return membershipSqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			DelaySeconds: delaySeconds,
		}),
	);
}

// returns true if message successfully processed
async function processAcquisition(
	subscriptionRecord: Subscription,
	identityId: string,
): Promise<boolean> {
	const subscriptionId = subscriptionRecord.subscriptionId;

	// Check if the subscription is active
	const now = new Date();
	const end = new Date(Date.parse(subscriptionRecord.endTimestamp));
	const endWithGracePeriod = plusDays(end, 30);
	const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();

	if (!valid) {
		console.log(
			`[af7e978e] subscription ${subscriptionRecord.subscriptionId} is not active. Stopping processing.`,
		);
		return true;
	}

	console.log('Setting soft opt-ins for acquisition event');

	const membershipAccountId = await getMembershipAccountId();
	const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

	try {
		await sendSoftOptIns(
			identityId,
			subscriptionId,
			subscriptionRecord.platform,
			queueNamePrefix,
		);
	} catch (e) {
		handleError(
			`[1f3a0ede] soft opt-in message send failed for subscriptionId: ${subscriptionId}. ${JSON.stringify(
				e,
			)}`,
		);
	}

	const isFeast =
		subscriptionRecord.platform === Platform.IosFeast ||
		subscriptionRecord.platform === Platform.AndroidFeast;

	if (
		subscriptionRecord &&
		(isPostAcquisition(subscriptionRecord.startTimestamp) || isFeast)
	) {
		const identityApiKey = await getIdentityApiKey();

		const emailAddress = await getUserEmailAddress(identityId, identityApiKey);
		const brazeMessage = buildBrazeEmailMessage(
			emailAddress,
			identityId,
			subscriptionRecord.platform,
		);

		try {
			await sendToSqsComms(
				`${queueNamePrefix}/braze-emails-${Stage}`,
				brazeMessage,
			);
		} catch (e) {
			handleError(
				`[5bec6354] failed to send comms for subscriptionId: ${subscriptionId}. ${JSON.stringify(
					e,
				)}`,
			);
		}

		console.log(
			`[72aca7f8] sent message to braze-emails queue for user: ${identityId}: ${JSON.stringify(brazeMessage)}`,
		);
	}

	return true;
}

async function sendToSqsSoftOptIns(
	queueUrl: string,
	event: SoftOptInEvent,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	const membershipSqs = await getSqsClientForSoftOptIns();
	return membershipSqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			DelaySeconds: delaySeconds,
		}),
	);
}

async function sendSoftOptIns(
	identityId: string,
	subscriptionId: string,
	platform: string | undefined,
	queueNamePrefix: string,
) {
	const productName = mapPlatformToSoftOptInProductName(platform);

	const message: SoftOptInEvent = {
		identityId: identityId,
		eventType: 'Acquisition',
		productName,
		subscriptionId: subscriptionId,
	};

	const queueUrl =
		Stage === 'PROD'
			? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD`
			: `${queueNamePrefix}/soft-opt-in-consent-setter-queue-CODE`;

	await sendToSqsSoftOptIns(queueUrl, message);
	console.log(
		`[7497f6a3] sent message to soft-opt-in-consent-setter-queue for user: ${identityId}: ${JSON.stringify(
			message,
		)}`,
	);
}

// -----------------------------------------------------------------------------
// Handler

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
	const dlqUrl = process.env.DLQUrl;

	if (!dlqUrl) {
		throw new Error('[0e6d0476] process.env.DLQUrl is undefined');
	}

	console.log(`[b35c1956] dlqUrl: ${dlqUrl}`);

	const records = event.Records;

	let processedCount = 0;

	for (const record of records) {
		const eventName = record.eventName;

		// We only process INSERT events.
		// For that we try and extract the subscription record with the given
		// subscriptionId and call `processAcquisition`.
		// If we could not extract a subscription record, we send the event to
		// the dead letter queue.

		if (eventName === 'INSERT') {
			processedCount++;
			const identityId = record.dynamodb?.NewImage?.userId?.S || '';
			const subscriptionId = record.dynamodb?.NewImage?.subscriptionId?.S || '';
			console.log(
				`[71744259] identityId: ${identityId}, subscriptionId: ${subscriptionId}`,
			);

			let subscriptionRecord: Subscription;

			try {
				const result = await dynamoClient.send(
					new GetItemCommand({
						TableName: `mobile-purchases-${Stage}-subscriptions`,
						Key: { subscriptionId: { S: subscriptionId } },
					}),
				);
				if (!result.Item) {
					throw new Error(
						`[6529e6f7] subscription ${subscriptionId} not found`,
					);
				}
				subscriptionRecord = unmarshall(result.Item) as Subscription;
			} catch (error) {
				console.log(
					`[e5201022] Subscription ${subscriptionId} record not found in the subscriptions table. Error: ${error}`,
				);

				try {
					const timestamp = Date.now();
					await sendToSqs(dlqUrl, { subscriptionId, identityId, timestamp });
				} catch (e) {
					console.log(
						`[39fd8be1] could not send message to dead letter queue for identityId: ${identityId}, subscriptionId: ${subscriptionId}. Error: ${e}`,
					);
				}
				continue;
			}

			await processAcquisition(subscriptionRecord, identityId);
		}
	}

	console.log(
		`[f314aa19] processed ${processedCount} newly inserted records from the link (mobile-purchases-${Stage}-user-subscriptions) DynamoDB table`,
	);
}
