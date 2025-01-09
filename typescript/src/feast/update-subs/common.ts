import { UserSubscription } from '../../models/userSubscription';
import { dynamoMapper, sendToSqs } from '../../utils/aws';
import { Subscription } from '../../models/subscription';

export const storeUserSubscriptionInDynamo = (
	userSubscription: UserSubscription,
): Promise<void> => {
	return dynamoMapper.put({ item: userSubscription }).then((_) => {});
};

export async function queueHistoricalSubscription(
	subscription: Subscription,
): Promise<void> {
	const queueUrl = process.env.HistoricalQueueUrl;
	if (queueUrl === undefined)
		throw new Error('No HistoricalQueueUrl env parameter provided');

	const payload = subscription.googlePayload ?? subscription.applePayload;
	if (payload) {
		await sendToSqs(queueUrl, {
			subscriptionId: subscription.subscriptionId,
			snapshotDate: new Date().toISOString(),
			payload,
		});
	}
}
