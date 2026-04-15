import type { Subscription } from '../models/subscription';
import { SubscriptionEmpty } from '../models/subscription';
import { dynamoMapper, sqs } from '../utils/aws';
import { processAcquisition } from './processSubscription';
import {
	ReceiveMessageCommand,
	DeleteMessageCommand,
} from '@aws-sdk/client-sqs';

interface MessageBody {
	identityId: string;
	subscriptionId: string;
	timestamp: number;
}

export function messageIsOneDayOld(timestamp: number): boolean {
	const now = Date.now();

	return now - timestamp >= 86400000;
}

async function deleteMessage(dlqUrl: string, receiptHandle: string) {
	const command = new DeleteMessageCommand({
		QueueUrl: dlqUrl,
		ReceiptHandle: receiptHandle,
	});
	return sqs.send(command);
}

export async function handler(_event: unknown): Promise<void> {
	const dlqUrl = process.env.DLQUrl;

	if (!dlqUrl) {
		throw new Error('process.env.DLQUrl is undefined');
	}

	const isRunning = true;
	while (isRunning) {
		// Receive messages from the DLQ
		const receiveCommand = new ReceiveMessageCommand({
			QueueUrl: dlqUrl,
			MaxNumberOfMessages: 10, // adjust as needed
		});
		const data = await sqs.send(receiveCommand);

		// Check if there are any messages
		if (!data.Messages || data.Messages.length === 0) {
			console.log('No messages to process');
			break;
		}

		// Process each message
		for (const message of data.Messages) {
			if (!message.Body) {
				// Should never happen
				throw new Error(
					`Message ${message.MessageId} does not have a Body property`,
				);
			}

			if (!message.ReceiptHandle) {
				// Should never happen
				throw new Error(
					`Message ${message.MessageId} does not have a ReceiptHandle property`,
				);
			}

			let body: MessageBody;

			try {
				body = JSON.parse(message.Body);
			} catch (err) {
				throw new Error(
					`JSON.parse() failed to parse Body of message ${message.MessageId}: ${err}`,
				);
			}

			const { identityId, subscriptionId, timestamp } = body;

			if (messageIsOneDayOld(timestamp)) {
				console.log(
					`Message ${message.MessageId} is more than one day old. Deleting message from DLQ`,
				);
				await deleteMessage(dlqUrl, message.ReceiptHandle);
				continue;
			}

			console.log(
				`identityId: ${identityId}, subscriptionId: ${subscriptionId}, timestamp: ${timestamp}`,
			);

			const subEmpty = new SubscriptionEmpty();
			subEmpty.setSubscriptionId(subscriptionId);

			let subscriptionRecord: Subscription;

			try {
				subscriptionRecord = await dynamoMapper.get(subEmpty);
			} catch (error) {
				console.log(
					`[5410a826] Subscription ${subscriptionId} record not found in the subscriptions table. Error: `,
					error,
				);
				continue;
			}

			const success = await processAcquisition(subscriptionRecord, identityId);

			if (success) {
				await deleteMessage(dlqUrl, message.ReceiptHandle);
			}
		}
	}
}
