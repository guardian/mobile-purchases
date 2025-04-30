import 'source-map-support/register';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { Subscription } from '../models/subscription';
import type { AppleSubscriptionReference } from '../models/subscriptionReference';
import type { AppleValidationResponse } from '../services/appleValidateReceipts';
import { validateReceipt } from '../services/appleValidateReceipts';
import { appleBundleToPlatform } from '../services/appToPlatform';
import { PRODUCT_BILLING_PERIOD } from '../services/productBillingPeriod';
import { dateToSecondTimestamp, thirtyMonths } from '../utils/dates';
import { parseAndStoreSubscriptionUpdate } from './updatesub';
import { AppleStoreKitSubscriptionDataDerivationForExtra, transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra } from '../services/api-storekit';

export async function toAppleSubscription(
  response: AppleValidationResponse,
): Promise<Subscription> {
  const latestReceiptInfo = response.latestReceiptInfo;

  let autoRenewStatus = false;
  if (response.latestReceiptInfo.autoRenewStatus) {
    autoRenewStatus = true;
  }

  let cancellationDate: string | undefined;
  if (latestReceiptInfo.cancellationDate) {
    cancellationDate = latestReceiptInfo.cancellationDate.toISOString();
  }

  const billingPeriod = PRODUCT_BILLING_PERIOD[latestReceiptInfo.productId];
  if (billingPeriod === undefined) {
    console.warn(
      `Unable to get the billing period, unknown product ID ${latestReceiptInfo.productId}`,
    );
  }

  const appBundleId = response.latestReceiptInfo.bundleId || "uk.co.guardian.iphone2";
  const originalTransactionId = latestReceiptInfo.originalTransactionId;
  const extra1: AppleStoreKitSubscriptionDataDerivationForExtra | null = await transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra(appBundleId, originalTransactionId);
  const extra2 = JSON.stringify(extra1);
  console.log(`[bae41983] extra: ${extra2}`);

  return new Subscription(
    originalTransactionId, // subscriptionId
    latestReceiptInfo.originalPurchaseDate.toISOString(), // startTimestamp
    latestReceiptInfo.expiresDate.toISOString(), // endTimestamp
    cancellationDate, // cancellationTimestamp
    autoRenewStatus, // autoRenewing
    latestReceiptInfo.productId, // productId
    appleBundleToPlatform(response.latestReceiptInfo.bundleId)?.toString(), // platform
    latestReceiptInfo.trialPeriod || latestReceiptInfo.inIntroOfferPeriod, // freeTrial
    billingPeriod, // billingPeriod
    null, // googlePayload
    response.latestReceipt, // receipt
    response.originalResponse, // applePayload
    dateToSecondTimestamp(thirtyMonths(latestReceiptInfo.expiresDate)), // ttl
    extra2,
  );
}

function sqsRecordToAppleSubscription(
  record: SQSRecord,
): Promise<Subscription[]> {
  const subRef = JSON.parse(record.body) as AppleSubscriptionReference;

  // sandboxRetry is set to false such that in production we don't store any sandbox receipt that would have snuck all the way here
  // In CODE or locally the default endpoint will be sanbox therefore no retry is necessary
  return validateReceipt(subRef.receipt, { sandboxRetry: false }).then((subs) =>
    Promise.all(subs.map((sub) => toAppleSubscription(sub))),
  ); // `subs` here is a AppleValidationResponse[]
}

export async function handler(event: SQSEvent): Promise<string> {
  const promises = event.Records.map((record) =>
    parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription),
  );
  return Promise.all(promises).then((_) => 'OK');
}
