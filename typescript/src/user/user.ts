import 'source-map-support/register'
import {HTTPResponses} from "../models/apiGatewayHttp";
import {Subscription, ReadSubscription} from "../models/subscription";
import {ReadUserSubscription} from "../models/userSubscription";
import {dynamoMapper} from "../utils/aws"
import {getUserId, getAuthToken, UserIdResolution} from "../utils/guIdentityApi";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {plusDays} from "../utils/dates";
import {getConfigValue} from "../utils/ssmConfig";

interface SubscriptionStatus {
    subscriptionId: string
    from: string
    to: string
    cancellationTimestamp?: string
    valid: boolean
    gracePeriod: boolean
    autoRenewing: boolean
    productId: string
}

interface SubscriptionStatusResponse {
    subscriptions: SubscriptionStatus[]
}

async function getUserSubscriptionIds(userId: string): Promise<string[]> {
    const subs: string[] = [];

    const subscriptionResults = dynamoMapper.query(ReadUserSubscription, {userId: userId});

    for await (const sub of subscriptionResults) {
        subs.push(sub.subscriptionId)
    }
    return subs
}

async function getSubscriptions(subscriptionIds: string[]) : Promise<SubscriptionStatusResponse>  {
    const subs: ReadSubscription[] = [];
    const toGet = subscriptionIds.map(subscriptionId => new ReadSubscription().setSubscriptionId(subscriptionId));

    for await (const sub of dynamoMapper.batchGet(toGet)  ) {
        subs.push(sub)
    }

    const sortedSubs = subs.sort((subscriptionA: Subscription, subscriptionB: Subscription) => {
        const endTimeA = subscriptionA.endTimestamp && Date.parse(subscriptionA.endTimestamp) || 0;
        const endTimeB = subscriptionB.endTimestamp && Date.parse(subscriptionB.endTimestamp) || 0;
        return endTimeA - endTimeB;
    });

    const now = new Date();

    const subscriptionStatuses: SubscriptionStatus[] = sortedSubs.map(sub => {
        const end = new Date(Date.parse(sub.endTimestamp));
        const endWithGracePeriod = plusDays(end, 30);
        const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();
        const gracePeriod: boolean = now.getTime() > end.getTime() && valid;

        return {
            subscriptionId: sub.subscriptionId,
            from: sub.startTimestamp,
            to: sub.endTimestamp,
            cancellationTimestamp: sub.cancellationTimestamp,
            valid: valid,
            gracePeriod: gracePeriod,
            autoRenewing: sub.autoRenewing,
            productId: sub.productId
        }
    });

    return {
        subscriptions: subscriptionStatuses
    }
}

async function apiKeyConfig(): Promise<string[]> {
    // returning an array just in case we get more than one client one day
    const apiKey = await getConfigValue<string>("user.api-key.0");
    return [apiKey]
}

export async function handler(httpRequest: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    try {
        const apiKeys = await apiKeyConfig();
        const authToken = getAuthToken(httpRequest.headers);

        let userId: string;

        if (authToken && apiKeys.includes(authToken)) {
            if (httpRequest.pathParameters && httpRequest.pathParameters["userId"]) {
                userId = httpRequest.pathParameters["userId"];
            } else {
                return HTTPResponses.INVALID_REQUEST;
            }
        } else {
            const resolution: UserIdResolution = await getUserId(httpRequest.headers);
            switch(resolution.status) {
                case "incorrect-token": {
                    return HTTPResponses.UNAUTHORISED;
                }
                case "incorrect-scope": {
                    return HTTPResponses.FORBIDDEN;
                }
                case "missing-identity-id": {
                    return HTTPResponses.INVALID_REQUEST;
                }
                case "success": {
                    userId = (resolution.userId as string)
                    break;
                }
            }
        }

        const userSubscriptionIds = await getUserSubscriptionIds(userId);
        const subscriptionStatuses = await getSubscriptions(userSubscriptionIds);

        return {statusCode: 200, body: JSON.stringify(subscriptionStatuses)};

    } catch (error) {
        console.log(`Error retrieving user subscriptions: ${error}`);
        return HTTPResponses.INTERNAL_ERROR
    }

}