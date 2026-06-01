import type { Response } from 'node-fetch';
import fetch from 'node-fetch';
import { Platform } from '../models/platform';
import type { Subscription } from '../models/subscription';
import { Region, Stage } from '../utils/appIdentity';
import { sendToSqsComms, sendToSqsSoftOptIns } from '../utils/aws';
import type { SoftOptInEvent } from '../utils/aws';
import { plusDays } from '../utils/dates';
import {
	getIdentityApiKey,
	getIdentityUrl,
	getMembershipAccountId,
} from '../utils/guIdentityApi';
import { mapPlatformToSoftOptInProductName } from '../utils/softOptIns';

export function isPostAcquisition(startTimestamp: string): boolean {
	const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;
	const today = new Date();
	const acquisitionDate = new Date(startTimestamp);
	return today.getTime() - acquisitionDate.getTime() >= twoDaysInMilliseconds;
}

async function handleError(message: string): Promise<never> {
	// We set adding a common marker to all messages handled by this function
	const m2 = `[8892291c] ${message}`;
	console.warn(m2);
	throw new Error(m2);
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
				const json = await response.json();

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
