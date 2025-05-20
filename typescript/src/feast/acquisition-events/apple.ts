import type { SQSEvent, SQSRecord } from 'aws-lambda';
import fetch from 'node-fetch';
import { App } from '../../models/app';
import type { Subscription } from '../../models/subscription';
import type {
    AppleValidationResponse,
    ValidationOptions,
} from '../../services/appleValidateReceipts';
import { validateReceipt } from '../../services/appleValidateReceipts';
import { toAppleSubscription_async } from '../../update-subs/apple';
import { postPayloadToAcquisitionAPI } from './common';
import type { AcquisitionApiPayload, AcquisitionApiPayloadQueryParameter } from './common';
import { appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline } from '../../services/api-storekit';

const appleSubscriptionToAcquisitionApiPayload = async (
    subscription: Subscription,
): Promise<AcquisitionApiPayload> => {
    const extendedData =
        await appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline(
            subscription,
        );

    console.log(`[12901310] acquisition api payload: ${JSON.stringify(extendedData)}`);

    const eventTimeStamp = subscription.startTimestamp;
    const product = 'FEAST_APP';
    const amount = undefined; // Tom said to leave it undefined
    const country = extendedData.country;
    const currency = extendedData.currency;
    const componentId = undefined;
    const componentType = undefined;
    const campaignCode = undefined;
    const source = undefined;
    const referrerUrl = undefined;
    const abTests: void[] = [];
    const paymentFrequency = extendedData.paymentFrequency;
    const paymentProvider = undefined;
    const printOptions = undefined;
    const browserId = undefined;
    const identityId = undefined;
    const pageViewId = undefined;
    const referrerPageViewId = undefined;
    const labels: void[] = [];
    const promoCode = undefined;
    const reusedExistingPaymentMethod = false;
    const readerType = 'Direct';
    const acquisitionType = 'PURCHASE';
    const zuoraSubscriptionNumber = undefined;
    const contributionId = undefined;

    // See comment id: e3f790af
    const paymentId = subscription.subscriptionId;

    const queryParameters: AcquisitionApiPayloadQueryParameter[] = [];
    const platform = undefined;
    const postalCode = undefined;
    const state = undefined;
    const email = undefined;

    const payload: AcquisitionApiPayload = {
        eventTimeStamp,
        product,
        amount,
        country,
        currency,
        componentId,
        componentType,
        campaignCode,
        source,
        referrerUrl,
        abTests,
        paymentFrequency,
        paymentProvider,
        printOptions,
        browserId,
        identityId,
        pageViewId,
        referrerPageViewId,
        labels,
        promoCode,
        reusedExistingPaymentMethod,
        readerType,
        acquisitionType,
        zuoraSubscriptionNumber,
        contributionId,
        paymentId,
        queryParameters,
        platform,
        postalCode,
        state,
        email,
    };
    return payload;
};

const processSQSRecord = async (record: SQSRecord): Promise<void> => {
    const subscription = JSON.parse(record.body);
    const receipt = subscription['receipt'];
    console.log(`[8a50f97d] receipt: ${receipt}`);
    if (receipt === undefined) {
        console.log(`[4ddde2a0] receipt is undefined`);
        return;
    }
    const validationOptions: ValidationOptions = {
        sandboxRetry: true,
    };
    const appleValidationResponses: AppleValidationResponse[] = await validateReceipt(
        receipt,
        validationOptions,
        App.Feast,
    );
    console.log(`[2dc25207] AppleValidationResponses: ${JSON.stringify(appleValidationResponses)}`);
    const promises = appleValidationResponses.map(async (appleValidationResponse) => {
        const appleSubscription: Subscription =
            await toAppleSubscription_async(appleValidationResponse);
        console.log(`[a41a0078] appleSubscription: ${JSON.stringify(appleSubscription)}`);
        const payload = await appleSubscriptionToAcquisitionApiPayload(appleSubscription);
        console.log(`[ffdce775] acquisition api payload: ${JSON.stringify(payload)}`);
        await postPayloadToAcquisitionAPI(payload);
    });
    await Promise.all(promises);
};

export const handler = async (event: SQSEvent): Promise<void> => {
    console.log('[0a06c521] Feast Apple Acquisition Events Lambda has been called');
    console.log(`[d9a1beb1] Processing ${event.Records.length} records`);
    const promises = event.Records.map(async (record: SQSRecord) => {
        await processSQSRecord(record);
    });
    await Promise.all(promises);
    console.log('[2ebc3ffa] Finished processing records');
};
