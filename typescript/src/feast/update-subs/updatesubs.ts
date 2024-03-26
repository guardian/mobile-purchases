import { SQSEvent, SQSRecord } from "aws-lambda";
import { validateReceipt } from "../../services/appleValidateReceipts";
import { AppleSubscriptionReference } from "../../models/subscriptionReference";
import { toAppleSubscription } from "../../update-subs/apple";
import { Subscription } from "../../models/subscription";
import { dynamoMapper } from "../../utils/aws";
import { App } from "../../models/app"

const decodeSubscriptionReference =
    (record: SQSRecord): AppleSubscriptionReference => {
        return JSON.parse(record.body) as AppleSubscriptionReference;
    }

const defaultFetchSubscriptionsFromApple =
    (reference: AppleSubscriptionReference): Promise<Subscription[]> => {
        return validateReceipt(reference.receipt, {sandboxRetry: false}, App.Feast).then(subs => subs.map(toAppleSubscription))
    }

const defaultStoreSubscriptionInDynamo =
    (subscription: Subscription): Promise<void> => {
        return dynamoMapper.put({item: subscription}).then(_ => {})
    }

export function buildHandler(
    fetchSubscriptionsFromApple: (reference: AppleSubscriptionReference) => Promise<Subscription[]> = defaultFetchSubscriptionsFromApple,
    storeSubscriptionInDynamo: (subscription: Subscription) => Promise<void> = defaultStoreSubscriptionInDynamo
): (event: SQSEvent) => Promise<string> {
    return async (event: SQSEvent) => {
        const work =
            event.Records.map(async record => {
                const reference =
                    decodeSubscriptionReference(record)

                const subscriptions =
                    await fetchSubscriptionsFromApple(reference)

                await Promise.all(subscriptions.map(storeSubscriptionInDynamo))
            })

        return Promise.all(work).then(_ => "OK")
    }
}

export const handler = buildHandler();
