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
import { GracefulProcessingError } from "../../models/GracefulProcessingError";

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

type FetchSubsFromApple = (reference: AppleSubscriptionReference) => Promise<HasAppAccountToken<Subscription>[]>;
type StoreSubInDynamo = (subscription: Subscription) => Promise<void>;
type ExchangeExternalIdForIdentityId = (externalId: string) => Promise<string>;
type StoreUserSubInDynamo = (userSubscription: UserSubscription) => Promise<void>;

const processRecord = async (
    fetchSubscriptionsFromApple: FetchSubsFromApple,
    storeSubscriptionInDynamo: StoreSubInDynamo,
    exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId,
    storeUserSubscriptionInDynamo: StoreUserSubInDynamo,
    record: SQSRecord
) => {
    const reference =
        decodeSubscriptionReference(record)

    const subscriptions =
        await fetchSubscriptionsFromApple(reference)

    await Promise.all(subscriptions.map(storeSubscriptionInDynamo))

    const userSubscriptions =
        await Promise.all(subscriptions.map(async s => {
            const identityId = await exchangeExternalIdForIdentityId(s.appAccountToken)
            const now = new Date().toISOString()

            return new UserSubscription(identityId, s.subscriptionId, now)
        }))

    return Promise.all(userSubscriptions.map(storeUserSubscriptionInDynamo))
}

const processRecordWithErrorHandling = async (
    fetchSubscriptionsFromApple: FetchSubsFromApple,
    storeSubscriptionInDynamo: StoreSubInDynamo,
    exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId,
    storeUserSubscriptionInDynamo: StoreUserSubInDynamo,
    record: SQSRecord
) => {
    try {
        return await processRecord(
            fetchSubscriptionsFromApple,
            storeSubscriptionInDynamo,
            exchangeExternalIdForIdentityId,
            storeUserSubscriptionInDynamo,
            record
        );
    } catch (error) {
        if (error instanceof GracefulProcessingError) {
            console.warn("Error processing the subscription update is being handled gracefully", error);
            return;
        } else {
           console.error("Unexpected error, will throw to retry: ", error);
           throw error;
        }
    }   
}

export function buildHandler(
    fetchSubscriptionsFromApple: FetchSubsFromApple = defaultFetchSubscriptionsFromApple,
    storeSubscriptionInDynamo: StoreSubInDynamo = defaultStoreSubscriptionInDynamo,
    exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId = getIdentityIdFromBraze,
    storeUserSubscriptionInDynamo: StoreUserSubInDynamo = defaultStoreUserSubscriptionInDynamo,
): (event: SQSEvent) => Promise<string> {
    return (event: SQSEvent) => {
        const promises = event.Records.map((record) => {
            return processRecordWithErrorHandling(
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
