import { dynamoMapper, sendToSqs, sqs } from '../utils/aws';
import { processAcquisition } from './processSubscription';
import { SubscriptionEmpty, Subscription } from '../models/subscription';

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
	return sqs
		.deleteMessage({
			QueueUrl: dlqUrl,
			ReceiptHandle: receiptHandle,
		})
		.promise();
}

export async function handler(event: any): Promise<void> {
	const dlqUrl = process.env.DLQUrl;

	if (!dlqUrl) {
		throw new Error('process.env.DLQUrl is undefined');
	}

	while (true) {
		// Receive messages from the DLQ
		const data = await sqs
			.receiveMessage({
				QueueUrl: dlqUrl,
				MaxNumberOfMessages: 10, // adjust as needed
			})
			.promise();

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
					`Subscription ${subscriptionId} record not found in the subscriptions table. Error: `,
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
