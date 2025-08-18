import 'source-map-support/register';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { ProcessingError } from '../models/processingError';
import { Subscription } from '../models/subscription';
import type { GoogleSubscriptionReference } from '../models/subscriptionReference';
import { googlePackageNameToPlatform } from '../services/appToPlatform';
import type { GoogleResponseBody } from '../services/google-play';
import { fetchGoogleSubscription, GOOGLE_PAYMENT_STATE } from '../services/google-play';
import { PRODUCT_BILLING_PERIOD } from '../services/productBillingPeriod';
import { dateToSecondTimestamp, optionalMsToDate, thirtyMonths } from '../utils/dates';
import { parseAndStoreSubscriptionUpdate } from './updatesub';

export const googleResponseBodyToSubscription = (
    purchaseToken: string,
    packageName: string,
    subscriptionId: string,
    billingPeriod: string,
    googleResponse: GoogleResponseBody | null,
): Subscription => {
    if (!googleResponse) {
        throw new ProcessingError('There was no data in the response from google', true);
    }

    const expiryDate = optionalMsToDate(googleResponse.expiryTimeMillis);
    if (expiryDate === null) {
        throw new ProcessingError(
            `Unable to parse the expiryTimeMillis field ${googleResponse.expiryTimeMillis}`,
            false,
        );
    }

    const startDate = optionalMsToDate(googleResponse.startTimeMillis);
    if (startDate === null) {
        throw new ProcessingError(
            `Unable to parse the startTimeMillis field ${googleResponse.startTimeMillis}`,
            false,
        );
    }

    const freeTrial = googleResponse.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL;
    return new Subscription(
        purchaseToken,
        startDate.toISOString(),
        expiryDate.toISOString(),
        optionalMsToDate(googleResponse.userCancellationTimeMillis)?.toISOString(),
        googleResponse.autoRenewing,
        subscriptionId,
        googlePackageNameToPlatform(packageName)?.toString(),
        freeTrial,
        billingPeriod,
        googleResponse,
        undefined,
        null,
        dateToSecondTimestamp(thirtyMonths(expiryDate)),
    );
};

export async function getGoogleSubResponse(record: SQSRecord): Promise<Subscription[]> {
    const subscriptionReference = JSON.parse(record.body) as GoogleSubscriptionReference;

    let response;
    try {
        response = await fetchGoogleSubscription(
            subscriptionReference.subscriptionId,
            subscriptionReference.purchaseToken,
            subscriptionReference.packageName,
        );
    } catch (exception: any) {
        if (exception.statusCode === 410) {
            console.log(`Purchase expired a very long time ago, ignoring`);
            return [];
        }
        if (exception.statusCode === 400 && exception?.result?.error?.message === 'Invalid Value') {
            console.warn(
                "The purchase token value was invalid, we can't recover from this error",
                exception,
            );
            throw new ProcessingError('Invalid token value', false);
        } else {
            throw exception;
        }
    }

    const billingPeriod = PRODUCT_BILLING_PERIOD[subscriptionReference.subscriptionId];
    if (billingPeriod === undefined) {
        console.warn(
            `[593d026a] Unable to get the billing period, unknown google subscription ID ${subscriptionReference.subscriptionId}`,
        );
    }

    const subscription = googleResponseBodyToSubscription(
        subscriptionReference.purchaseToken,
        subscriptionReference.packageName,
        subscriptionReference.subscriptionId,
        billingPeriod,
        response,
    );
    return [subscription];
}

export async function handler(event: SQSEvent) {
    const promises = event.Records.map((record) => {
        console.log(`[447bd6ea] event: ${JSON.stringify(record)}`);
        return parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse);
    });

    return Promise.all(promises).then((_) => 'OK');
}
