import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { App } from '../../models/app'
import { Subscription } from "../../models/subscription";
import { ValidationOptions, AppleValidationResponse, validateReceipt } from "../../services/appleValidateReceipts";
import { toAppleSubscription } from "../../update-subs/apple";
import { AcquisitionApiPayload, AcquisitionApiPayloadQueryParameter } from "./common";
import { postPayloadToAcquisitionAPI } from "./common";

const appleSubscriptionToAcquisitionApiPayload = (subscription: Subscription): AcquisitionApiPayload => {

    const eventTimeStamp = subscription.startTimestamp;
    const product = "FEAST_APP";
    const amount = undefined; // Tom said to leave it undefined

    // TODO:
    const country = "UK"; // We are going to fix that at some point

    // TODO:
    const currency = "GBP"; // We are going to fix that at some point

    const componentId = undefined;
    const componentType = undefined;
    const campaignCode = undefined;
    const source = undefined;
    const referrerUrl = undefined;
    const abTests: void[] = [];

    // TODO:
    const paymentFrequency = "MONTHLY"; // We are going to fix that at some point

    const paymentProvider = undefined;
    const printOptions = undefined;
    const browserId = undefined;
    const identityId = undefined;
    const pageViewId = undefined;
    const referrerPageViewId = undefined;
    const labels: void[] = [];
    const promoCode = undefined;
    const reusedExistingPaymentMethod = false;
    const readerType = "Direct";
    const acquisitionType = "PURCHASE";
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
    }
    return payload;
}

const processSQSRecord = async (record: SQSRecord): Promise<void> => {
    const subscription = JSON.parse(record.body);
    const receipt = subscription["receipt"];
    console.log(`[8a50f97d] receipt: ${receipt}`);
    if (receipt === undefined) {
        console.log(`[4ddde2a0] receipt is undefined`);
        return;
    }
    const validationOptions: ValidationOptions = {
        sandboxRetry: true
    }
    const appleValidationResponses: AppleValidationResponse[] = await validateReceipt(receipt, validationOptions, App.Feast);
    console.log(`[2dc25207] AppleValidationResponses: ${JSON.stringify(appleValidationResponses)}`);
    appleValidationResponses.forEach(async appleValidationResponse => {
        const appleSubscription: Subscription = toAppleSubscription(appleValidationResponse)
        console.log(`[a41a0078] appleSubscription: ${JSON.stringify(appleSubscription)}`);
        const payload = appleSubscriptionToAcquisitionApiPayload(appleSubscription);
        console.log(`[ffdce775] acquisition api payload: ${JSON.stringify(payload)}`);
        await postPayloadToAcquisitionAPI(payload);
    })
}

export const handler = async (event: SQSEvent): Promise<void> => {
    console.log('[0a06c521] Feast Apple Acquisition Events Lambda has been called');
    console.log(`[d9a1beb1] Processing ${event.Records.length} records`);
    const promises = event.Records.map( async (record: SQSRecord) => {
        await processSQSRecord(record)
    });
    await Promise.all(promises);
    console.log('[2ebc3ffa] Finished processing records');
}
