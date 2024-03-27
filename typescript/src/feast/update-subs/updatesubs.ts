import { SQSEvent, SQSRecord } from "aws-lambda";
import { validateReceipt } from "../../services/appleValidateReceipts";
import { AppleSubscriptionReference } from "../../models/subscriptionReference";
import { toAppleSubscription } from "../../update-subs/apple";
import { Subscription } from "../../models/subscription";
import { dynamoMapper } from "../../utils/aws";
import { App } from "../../models/app"
import { ProcessingError } from "../../models/processingError";
import { UserSubscription } from "../../models/userSubscription";
import { getIdentityIdFromBraze } from "../../services/braze";

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

export const defaultFetchSubscriptionsFromApple =
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

const defaultStoreUserSubscriptionInDynamo =
    (userSubscription: UserSubscription): Promise<void> => {
        return dynamoMapper.put({ item: userSubscription }).then(_ => {})
    }

const processRecord = async (
    fetchSubscriptionsFromApple: (reference: AppleSubscriptionReference) => Promise<HasAppAccountToken<Subscription>[]>,
    storeSubscriptionInDynamo: (subscription: Subscription) => Promise<void>,
    exchangeExternalIdForIdentityId: (externalId: string) => Promise<string>,
    storeUserSubscriptionInDynamo: (userSubscription: UserSubscription) => Promise<void>,
    record: SQSRecord
) => {
    const reference =
        decodeSubscriptionReference(record)

    const subscriptions =
        await fetchSubscriptionsFromApple(reference)

    await Promise.all(subscriptions.map(storeSubscriptionInDynamo))

    const userSubscriptions =
        await Promise.all(subscriptions.map(async s => {
            const identityId =
                await exchangeExternalIdForIdentityId(s.appAccountToken)
            const now =
                new Date().toISOString()

            return new UserSubscription(identityId, s.subscriptionId, now)
        }))

    return Promise.all(userSubscriptions.map(storeUserSubscriptionInDynamo))
}

export function buildHandler(
    fetchSubscriptionsFromApple: (reference: AppleSubscriptionReference) => Promise<HasAppAccountToken<Subscription>[]> = defaultFetchSubscriptionsFromApple,
    storeSubscriptionInDynamo: (subscription: Subscription) => Promise<void> = defaultStoreSubscriptionInDynamo,
    exchangeExternalIdForIdentityId: (externalId: string) => Promise<string> = getIdentityIdFromBraze,
    storeUserSubscriptionInDynamo: (userSubscription: UserSubscription) => Promise<void> = defaultStoreUserSubscriptionInDynamo,
): (event: SQSEvent) => Promise<string> {
    return (event: SQSEvent) => {
        const promises = event.Records.map((record) => {
            return processRecord(
                fetchSubscriptionsFromApple,
                storeSubscriptionInDynamo,
                exchangeExternalIdForIdentityId,
                storeUserSubscriptionInDynamo,
                record,
            )
        })

        return Promise.all(promises).then(_ => "OK")
    }
}

export const handler = buildHandler();
