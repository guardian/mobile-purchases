import { SQSEvent, SQSRecord } from "aws-lambda";
import { validateReceipt } from "../../services/appleValidateReceipts";
import { AppleSubscriptionReference } from "../../models/subscriptionReference";
import { toAppleSubscription } from "../../update-subs/apple";
import { Subscription } from "../../models/subscription";
import { dynamoMapper } from "../../utils/aws";
import { App } from "../../models/app"
import { ProcessingError } from "../../models/processingError";

type AppAccountToken = {
    appAccountToken: string
}

type HasAppAccountToken<A> = AppAccountToken & A

export const withAppAccountToken =
    <A extends Object>(a: A, appAccountToken: string): HasAppAccountToken<A> => {
        return Object.assign(a, { appAccountToken: appAccountToken })
    }

const decodeSubscriptionReference =
    (record: SQSRecord): AppleSubscriptionReference => {
        return JSON.parse(record.body) as AppleSubscriptionReference;
    }

const defaultFetchSubscriptionsFromApple =
    async (reference: AppleSubscriptionReference): Promise<HasAppAccountToken<Subscription>[]> => {
        const responses = await validateReceipt(reference.receipt, { sandboxRetry: false }, App.Feast);
        return responses.map(response => {
            if (response.latestReceiptInfo.appAccountToken) {
                return withAppAccountToken(toAppleSubscription(response), response.latestReceiptInfo.appAccountToken) 
            } else {
                throw new ProcessingError(`Subscription with receipt '${response.latestReceipt}' did not have an 'appAccountToken'`, false)
            }
        })
    }

const defaultStoreSubscriptionInDynamo =
    (subscription: Subscription): Promise<void> => {
        return dynamoMapper.put({item: subscription}).then(_ => {})
    }

export function buildHandler(
    fetchSubscriptionsFromApple: (reference: AppleSubscriptionReference) => Promise<HasAppAccountToken<Subscription>[]> = defaultFetchSubscriptionsFromApple,
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
