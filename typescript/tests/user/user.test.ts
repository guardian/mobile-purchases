import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "../../src/user/user";

const TEST_SECRET = 'test_secret';
jest.mock("../../src/utils/ssmConfig", () => {
  return {
    getConfigValue: () => Promise.resolve(TEST_SECRET),
  };
});

jest.mock('@aws/dynamodb-data-mapper', () => {
    const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

    const queryFn = jest.fn();

    return {
        ...actualDataMapper,
        DataMapper: jest.fn().mockImplementation(() => ({
            query: queryFn,
        })),
        setMockQuery: (mockImplementation: (arg0: any) => any) => {
            queryFn.mockImplementation(async function* (params) {
                const iterator = mockImplementation(params);
                for await (const item of iterator) {
                    yield item;
                }
            });
        },
    };
});
const setMockQuery = require('@aws/dynamodb-data-mapper').setMockQuery;

describe("The user subscriptions lambda", () => {
    it("returns the correct subscriptions for a user", async () => {
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const userId = "123";
        setMockQuery(async function* () {
            yield {
                userId,
                subscriptionId: "1",
            };
        });
        const event = buildApiGatewayEvent(userId);

        const response = await handler(event);

        expect(response.statusCode).toBe(200);
        expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
    });
});


const buildApiGatewayEvent = (userId: string): APIGatewayProxyEvent => {
    return {
        headers: {
            'Authorization': `Bearer ${TEST_SECRET}`
        },
        multiValueHeaders: {},
        httpMethod: "POST",
        isBase64Encoded: false,
        path: '',
        pathParameters: { userId },
        queryStringParameters: {secret: "test_secret"},
        multiValueQueryStringParameters: {},
        // @ts-ignore
        requestContext: null,
        resource: '',
    };
};
