import type { DynamoDBStreamEvent } from 'aws-lambda';
import type { Subscription } from '../models/subscription';
import { SubscriptionEmpty } from '../models/subscription';
import { Stage } from '../utils/appIdentity';
import { dynamoMapper, sendToSqs } from '../utils/aws';
import { processAcquisition } from './processSubscription';

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
	const dlqUrl = process.env.DLQUrl;

	if (!dlqUrl) {
		throw new Error('process.env.DLQUrl is undefined');
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

			const itemToQuery = new SubscriptionEmpty();
			itemToQuery.setSubscriptionId(subscriptionId);

			let subscriptionRecord: Subscription;

			try {
				subscriptionRecord = await dynamoMapper.get(itemToQuery);
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
