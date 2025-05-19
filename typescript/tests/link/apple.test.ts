import type { APIGatewayProxyEvent } from 'aws-lambda';
import { parseAppleLinkPayload } from '../../src/link/apple-utils';

describe('The apple link service', () => {
    test('Should deduplicate originalTransactionIds', () => {
        const raw = `{
      "platform":"ios-puzzles",
      "subscriptions":[
        {"originalTransactionId":"12345","receipt":"duplicate-receipt"},
        {"originalTransactionId":"12345","receipt":"duplicate-receipt"}
      ]
    }`;
        const parsed = parseAppleLinkPayload({ body: raw } as APIGatewayProxyEvent);
        expect(parsed.subscriptions.length).toStrictEqual(1);
    });
});
