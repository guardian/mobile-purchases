import { Subscription } from '../common/endTimestampFilter';
import { Platform } from '../common/platform';
import { buildHandler } from './appleRevalidateReceipts';
import { withEnv } from '../common/withEnv';

describe('appleRevalidateReceipts', () => {
	it('pushes events to the correct SQS queue', async () => {
		const feastSub = new Subscription(
			'12345',
			new Date().toISOString(),
			true,
			Platform.IosFeast,
			'FEAST-RECEIPT',
		);
		const liveAppSub = new Subscription(
			'67890',
			new Date().toISOString(),
			true,
			Platform.Ios,
			'LIVE-RECEIPT',
		);
		const getSubscriptions = () => [feastSub, liveAppSub];
		const sendToQueue = jest.fn();
		// @ts-expect-error: I just need something which we can iterate over
		const handler = buildHandler(getSubscriptions, sendToQueue);

		await withEnv(
			{ LiveAppSqsUrl: 'LiveAppSqsUrl', FeastAppSqsUrl: 'FeastAppSqsUrl' },
			async () => {
				await handler({});
			},
		);

		expect(sendToQueue).toHaveBeenCalledTimes(2);
		expect(sendToQueue).toHaveBeenCalledWith(
			'FeastAppSqsUrl',
			{ receipt: feastSub.receipt },
			0,
		);
		expect(sendToQueue).toHaveBeenCalledWith(
			'LiveAppSqsUrl',
			{ receipt: liveAppSub.receipt },
			0,
		);
	});
});
