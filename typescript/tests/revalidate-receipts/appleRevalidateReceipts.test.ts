import { Subscription } from '../../src/models/endTimestampFilter';
import { buildHandler } from '../../src/revalidate-receipts/appleRevalidateReceipts';
import { Platform } from '../../src/models/platform';
import { withEnv } from '../helpers/withEnv';

describe('appleRevalidateReceipts', () => {
  it('pushes events to the correct SQS queue', async () => {
    const feastSub = new Subscription(
      '12345',
      new Date().toISOString(),
      true,
      Platform.IosFeast,
      'FEAST-RECEIPT'
    );
    const liveAppSub = new Subscription(
      '67890',
      new Date().toISOString(),
      true,
      Platform.Ios,
      'LIVE-RECEIPT'
    );
    const getSubscriptions = () => [feastSub, liveAppSub];
    const sendToQueue = jest.fn();
    // @ts-ignore: I just need something which we can iterate over
    const handler = buildHandler(getSubscriptions, sendToQueue);

    await withEnv(
      { LiveAppSqsUrl: 'LiveAppSqsUrl', FeastAppSqsUrl: 'FeastAppSqsUrl' },
      async () => {
        await handler({});
      }
    );

    expect(sendToQueue).toHaveBeenCalledTimes(2);
    expect(sendToQueue).toHaveBeenCalledWith(
      'FeastAppSqsUrl',
      { receipt: feastSub.receipt },
      0
    );
    expect(sendToQueue).toHaveBeenCalledWith(
      'LiveAppSqsUrl',
      { receipt: liveAppSub.receipt },
      0
    );
  });
});
