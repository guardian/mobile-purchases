import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { App } from '../../models/app'
import { Subscription } from "../../models/subscription";
import { ValidationOptions, AppleValidationResponse, validateReceipt } from "../../services/appleValidateReceipts";
import { toAppleSubscription } from "../../update-subs/apple";
import { AcquisitionApiPayload, AcquisitionApiPayloadQueryParameter } from "./common";
import { postPayloadToAcquisitionAPI } from "./common";
import fetch from 'node-fetch';
import { getConfigValue } from "../../utils/ssmConfig";

// AppleExtendedData is built from the answer from
// https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
// and contains information that are required to build an AcquisitionApiPayload
interface AppleExtendedData {
    transactionId: string,
    country: string, // country as two letter code
    currency: string, // currency as three letter code
    paymentFrequency: string,
        // Same values as AcquisitionApiPayload.paymentFrequency
        // "ONE_OFF"
        // "MONTHLY"
        // "QUARTERLY"
        // "SIX_MONTHLY"
        // "ANNUALLY"
}

const appleSubscriptionToExtendedData = async (subscription: Subscription): Promise<AppleExtendedData> => {
    /*
        This function takes a Subscription and return the extra data that is retrieved from the Apple API
        at https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
    */

    console.log(`[940dc079] ${new Date}`);

    const transactionId = "220002304451105";
    const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${transactionId}`;
    console.log(`[5330931d] url: ${url}`);

    // /mobile-purchases/PROD/mobile/pascalAuthExperimental
    const auth = await getConfigValue<string>("pascalAuthExperimental");
    const params = {
        method: 'GET',
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${auth}`
        }
    }

    let json;

    try {
        console.log(`[0f984ea0] ${JSON.stringify(params)}`);
        const response = await fetch(url, params);
        if (response.ok) {
            json = await response.json();
        } else {
            console.error(`[661fe1aa] error: fetch failed: ${response.status}`);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`[c63b76d3] error: fetch failed: ${error.message}`);
        } else {
            console.error(`[e9848cd6] error: fetch failed: ${JSON.stringify(error)}`);
        }
    }

    console.log(`[55ca8e2c] ${JSON.stringify(json)}`);

    /*
    {
        "environment": "Production",
        "bundleId": "uk.co.guardian.Feast",
        "appAppleId": 603350f961c5,
        "data": [
            {
                "subscriptionGroupIdentifier": "21396030",
                "lastTransactions": [
                    {
                        "originalTransactionId": "220002304451105",
                        "status": 2,
                        "signedTransactionInfo": "eyJhbGciOeUJEWlhKMGF[removed]"
    */

    const data = json.data
    if (data === undefined) {
        throw new Error("[92d086b6] json.data is undefined");
    }                
    if (data.length === 0) {
        throw new Error("[2ee57da0] json.data is empty");
    }
    const item1 = data[0];
    const lastTransactions = item1.lastTransactions;
    if (lastTransactions === undefined) {
        throw new Error("[553620b1] json.data[0].lastTransactions is undefined");
    }
    if (lastTransactions.length === 0) {
        throw new Error("[2b6cd147] json.data[0].lastTransactions is empty");
    }
    const item2 = lastTransactions[0];
    const signedTransactionInfo = item2.signedTransactionInfo;
    if (signedTransactionInfo === undefined) {
        throw new Error("[f147df3e] json.data[0].lastTransactions[0].signedTransactionInfo is undefined");
    }

    console.log(`[c5dabbcc] ${signedTransactionInfo}`);

    /*
        payload (anonymized) from the answer

        {
            "transactionId": "2200001105",
            "originalTransactionId": "2200001105",
            "webOrderLineItemId": "22048309784",
            "bundleId": "uk.co.guardian.Feast",
            "productId": "uk.co.guardian.Feast.monthly",
            "subscriptionGroupIdentifier": "21396030",
            "purchaseDate": 1732526628000,
            "originalPurchaseDate": 1732526630000,
            "expiresDate": 1733736228000,
            "quantity": 1,
            "type": "Auto-Renewable Subscription",
            "appAccountToken": "3b70e18e-de6c-46a8-83b5-3e317d6c7b84",
            "inAppOwnershipType": "PURCHASED",
            "signedDate": 1735899829949,
            "offerType": 1,
            "environment": "Production",
            "transactionReason": "PURCHASE",
            "storefront": "GBR",
            "storefrontId": "143444",
            "price": 0,
            "currency": "GBP",
            "offerDiscountType": "FREE_TRIAL"
        }
    */

    const country = "UK"; // function of `answer.storefront`
    const currency = "GBP";
    const paymentFrequency = "MONTHLY"; // function of `answer.productId`
    return {
        transactionId,
        country,
        currency,
        paymentFrequency
    };
}

const appleSubscriptionToAcquisitionApiPayload = async (subscription: Subscription): Promise<AcquisitionApiPayload> => {

    const extendedData = await appleSubscriptionToExtendedData(subscription);

    const eventTimeStamp = subscription.startTimestamp;
    const product = "FEAST_APP";
    const amount = undefined; // Tom said to leave it undefined
    const country = extendedData.country;
    const currency = extendedData.currency;
    const componentId = undefined;
    const componentType = undefined;
    const campaignCode = undefined;
    const source = undefined;
    const referrerUrl = undefined;
    const abTests: void[] = [];
    const paymentFrequency = extendedData.paymentFrequency
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
    const promises = appleValidationResponses.map(async appleValidationResponse => {
        const appleSubscription: Subscription = toAppleSubscription(appleValidationResponse)
        console.log(`[a41a0078] appleSubscription: ${JSON.stringify(appleSubscription)}`);
        const payload = await appleSubscriptionToAcquisitionApiPayload(appleSubscription);
        console.log(`[ffdce775] acquisition api payload: ${JSON.stringify(payload)}`);
        await postPayloadToAcquisitionAPI(payload);
    })
    await Promise.all(promises);
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
