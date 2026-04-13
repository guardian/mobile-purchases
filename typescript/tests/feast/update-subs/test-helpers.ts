import type { SQSEvent } from 'aws-lambda';
import type { SubscriptionReference } from '../../../src/models/subscriptionReference';

export const buildSqsEvent = (
	subscriptions: SubscriptionReference[],
): SQSEvent => {
	const records = subscriptions.map((subscription) => ({
		messageId: '',
		receiptHandle: '',
		body: JSON.stringify(subscription),
		attributes: {
			ApproximateReceiveCount: '',
			SentTimestamp: '',
			SenderId: '',
			ApproximateFirstReceiveTimestamp: '',
		},
		messageAttributes: {},
		md5OfBody: '',
		eventSource: '',
		eventSourceARN: '',
		awsRegion: '',
	}));

	return {
		Records: records,
	};
};
