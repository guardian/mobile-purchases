import 'source-map-support/register';
import type { Subscription } from '../common/subscription';
import { Region, Stage } from '../common/appIdentity';
import {
	SQSClient,
	ReceiveMessageCommand,
	DeleteMessageCommand,
	SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { plusDays } from '../common/dates';
import { getMembershipAccountId } from '../common/guIdentityApi';
import { mapPlatformToSoftOptInProductName } from '../common/softOptIns';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { Platform } from '../common/platform';
import { getIdentityApiKey, getIdentityUrl } from '../common/guIdentityApi';

// -----------------------------------------------------------------------------
// Types

interface MessageBody {
	identityId: string;
	subscriptionId: string;
	timestamp: number;
}

type SoftOptInEventProductName = 'InAppPurchase' | 'FeastInAppPurchase';

interface SoftOptInEvent {
	identityId: string;
	eventType: 'Acquisition' | 'Cancellation' | 'Switch';
	productName: SoftOptInEventProductName;
	subscriptionId: string;
}

// -----------------------------------------------------------------------------
// Globals

const sqs = new SQSClient({ region: Region });

const dynamoClient = new DynamoDBClient({ region: Region });

let SOISqsClient: SQSClient | undefined;
let lastAssumedSOI: Date | undefined;
let commsSqsClient: SQSClient | undefined;
let lastAssumedComms: Date | undefined;

// -----------------------------------------------------------------------------
// Functions client initializations only

async function getSqsClientForComms(): Promise<SQSClient> {
	const now = new Date();
	if (
		!commsSqsClient ||
		!lastAssumedComms ||
		now.getTime() - lastAssumedComms.getTime() >= 1800000
	) {
		const membershipAccountId = await getMembershipAccountId();
		const sts = new STSClient({ region: Region });

		const assumeRoleResult = await sts.send(
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

// -----------------------------------------------------------------------------
// Functions

export function messageIsOneDayOld(timestamp: number): boolean {
	const now = Date.now();
	return now - timestamp >= 86400000;
}

async function deleteMessage(dlqUrl: string, receiptHandle: string) {
	return sqs.send(
		new DeleteMessageCommand({
			QueueUrl: dlqUrl,
			ReceiptHandle: receiptHandle,
		}),
	);
}

async function getSqsClientForSoftOptIns(): Promise<SQSClient> {
	const now = new Date();
	if (
		!SOISqsClient ||
		!lastAssumedSOI ||
		now.getTime() - lastAssumedSOI.getTime() >= 1800000
	) {
		// refresh every 30 minutes
		const membershipAccountId = await getMembershipAccountId();

		const softOptInConsentSetterStage = Stage === 'PROD' ? 'PROD' : 'CODE';

		const sts = new STSClient({ region: Region });
		const assumeRoleResult = await sts.send(
			new AssumeRoleCommand({
				RoleArn: `arn:aws:iam::${membershipAccountId}:role/membership-${softOptInConsentSetterStage}-soft-opt-in-consent-setter-QueueCrossAccountRole`,
				RoleSessionName: 'CrossAccountSession',
			}),
		);

		const credentials = assumeRoleResult.Credentials;

		if (!credentials) {
			throw Error('credentials undefined in getSqsClientForSoftOptIns');
		}

		SOISqsClient = new SQSClient({
			region: Region,
			credentials: {
				accessKeyId: credentials.AccessKeyId || '',
				secretAccessKey: credentials.SecretAccessKey || '',
				sessionToken: credentials.SessionToken || '',
			},
		});

		lastAssumedSOI = now;
	}

	return SOISqsClient;
}

async function sendToSqsSoftOptIns(
	queueUrl: string,
	event: SoftOptInEvent,
	delaySeconds?: number,
) {
	const membershipSqs = await getSqsClientForSoftOptIns();
	return membershipSqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			...(delaySeconds !== undefined && { DelaySeconds: delaySeconds }),
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

	await sendToSqsSoftOptIns(
		Stage === 'PROD'
			? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD`
			: `${queueNamePrefix}/soft-opt-in-consent-setter-queue-CODE`,
		message,
	);
	console.log(
		`[7497f6a3] sent message to soft-opt-in-consent-setter-queue for user: ${identityId}: ${JSON.stringify(
			message,
		)}`,
	);
}

async function handleError(message: string): Promise<never> {
	// We set adding a common marker to all messages handled by this function
	const m2 = `[8892291c] ${message}`;
	console.warn(m2);
	throw new Error(m2);
}

export function isPostAcquisition(startTimestamp: string): boolean {
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
) {
	const membershipSqs = await getSqsClientForComms();
	return membershipSqs.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			...(delaySeconds !== undefined && { DelaySeconds: delaySeconds }),
		}),
	);
}

// returns true if message successfully processed
export async function processAcquisition(
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

// -----------------------------------------------------------------------------
// Handler

export async function handler(_event: unknown): Promise<void> {
	const dlqUrl = process.env.DLQUrl;

	if (!dlqUrl) {
		throw new Error('process.env.DLQUrl is undefined');
	}

	const isRunning = true;
	while (isRunning) {
		// Receive messages from the DLQ
		const data = await sqs.send(
			new ReceiveMessageCommand({
				QueueUrl: dlqUrl,
				MaxNumberOfMessages: 10,
			}),
		);

		// Check if there are any messages
		if (!data.Messages || data.Messages.length === 0) {
			console.log('[2ac507af] no messages to process');
			break;
		}

		// Process each message
		for (const message of data.Messages) {
			if (!message.Body) {
				// Should never happen
				throw new Error(
					`[ded89e48] message ${message.MessageId} does not have a Body property`,
				);
			}

			if (!message.ReceiptHandle) {
				// Should never happen
				throw new Error(
					`[567149de] message ${message.MessageId} does not have a ReceiptHandle property`,
				);
			}

			let body: MessageBody;

			try {
				body = JSON.parse(message.Body);
			} catch (err) {
				throw new Error(
					`[841e2493] JSON.parse() failed to parse Body of message ${message.MessageId}: ${err}`,
				);
			}

			const { identityId, subscriptionId, timestamp } = body;

			if (messageIsOneDayOld(timestamp)) {
				console.log(
					`[3f8e7f5d] message ${message.MessageId} is more than one day old. Deleting message from DLQ`,
				);
				await deleteMessage(dlqUrl, message.ReceiptHandle);
				continue;
			}

			console.log(
				`[2c663a8c] identityId: ${identityId}, subscriptionId: ${subscriptionId}, timestamp: ${timestamp}`,
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
					console.log(
						`[65271cde] Subscription ${subscriptionId} record not found in the subscriptions table`,
					);
					continue;
				}
				subscriptionRecord = unmarshall(result.Item) as Subscription;
			} catch (error) {
				console.log(
					`[5410a826] problem while extracting subscription ${subscriptionId}. Error: ${error}`,
				);
				continue;
			}

			try {
				console.log(
					`[fd0c3e01] processing acquisition, subscriptionId: ${subscriptionId}, identityId: ${identityId}`,
				);
				const success = await processAcquisition(
					subscriptionRecord,
					identityId,
				);
				if (success) {
					await deleteMessage(dlqUrl, message.ReceiptHandle);
				}
			} catch (error) {
				console.log(`[ERROR] [952e2a60] error: ${error}`);
				throw error;
			}
		}
	}
}
