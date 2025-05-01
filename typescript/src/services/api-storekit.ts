import type { Subscription } from '../models/subscription';
import { getConfigValue } from '../utils/ssmConfig';
import { forgeStoreKitBearerToken } from './apple-json-web-tokens';
import { productIdToPaymentFrequency, storefrontToCountry } from './apple-mappings';
const jwt = require('jsonwebtoken');

// AppleStoreKitSubscriptionData is built from the answer from
// https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
// and contains information that are required to build an AcquisitionApiPayload

export interface AppleStoreKitSubscriptionData {
  transactionId: string,
  originalTransactionId: string,
  webOrderLineItemId: string,
  bundleId: string,
  productId: string,
  subscriptionGroupIdentifier: string,
  purchaseDate: number,
  originalPurchaseDate: number,
  expiresDate: number,
  quantity: number,
  type: string,
  appAccountToken: string,
  inAppOwnershipType: string,
  signedDate: number,
  offerType: number,
  environment: string,
  transactionReason: string,
  storefront: string,
  storefrontId: string,
  price: number,
  currency: string,
  offerDiscountType: string
}

// AppleStoreKitSubscriptionDataDerivationForFeastPipeline is derived from AppleStoreKitSubscriptionData
export interface AppleStoreKitSubscriptionDataDerivationForFeastPipeline {
  transactionId: string;
  country: string; // country as two letter code
  currency: string; // currency as three letter code
  paymentFrequency: string;
  // Same values as AcquisitionApiPayload.paymentFrequency
  // "ONE_OFF"
  // "MONTHLY"
  // "QUARTERLY"
  // "SIX_MONTHLY"
  // "ANNUALLY"
}

// AppleStoreKitSubscriptionDataDerivationForExtra is derived from AppleStoreKitSubscriptionData
// Was originally introduced as part of adding an extra key to SubscriptionEvent and AppleSubscription
// That are sent to the Lake.
// The only difference with AppleStoreKitSubscriptionData is that for safety and forward compatibility
// we introduce a guVersion, which is going to be incremented if there is any non backward compatible 
// change in that structure. 
export type AppleStoreKitSubscriptionDataDerivationForExtra = AppleStoreKitSubscriptionData & {  guType: "apple-extra-2025-04-29" }

interface AppleLatestReceiptInfoItem {
  transaction_id: string;
}
type AppleLatestReceiptInfo = AppleLatestReceiptInfoItem[];

export const transactionIdToAppleStoreKitSubscriptionData = async (appBundleId: string, transactionId: string): Promise<AppleStoreKitSubscriptionData | null> => {
  console.log(`[116fa7d4] transactionId: ${transactionId}`);

  const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${transactionId}`;
  console.log(`[5330931d] url: ${url}`);

  const token = await forgeStoreKitBearerToken(appBundleId);

  console.log(`[f1335718] ${token}`);

  const params = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };

  let json;

  try {
    console.log(`[0f984ea0] ${JSON.stringify(params)}`);
    const response = await fetch(url, params);
    if (response.ok) {
      json = await response.json();
    } else {
      console.error(`[661fe1aa] error: fetch failed: ${response.status}`);
      return Promise.resolve(null);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[c63b76d3] error: fetch failed: ${error.message}`);
    } else {
      console.error(`[e9848cd6] error: fetch failed: ${JSON.stringify(error)}`);
    }
    return Promise.resolve(null);
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

  // extracting signedTransactionInfo
  // Currently doing it by hand but it will be validated with zod in a coming refactoring

  const data = json.data;
  if (data === undefined) {
    throw new Error('[92d086b6] json.data is undefined');
  }
  if (data.length === 0) {
    throw new Error('[2ee57da0] json.data is empty');
  }
  const item1 = data[0];
  const lastTransactions = item1.lastTransactions;
  if (lastTransactions === undefined) {
    throw new Error('[553620b1] json.data[0].lastTransactions is undefined');
  }
  if (lastTransactions.length === 0) {
    throw new Error('[2b6cd147] json.data[0].lastTransactions is empty');
  }
  const item2 = lastTransactions[0];
  const signedTransactionInfo = item2.signedTransactionInfo;
  if (signedTransactionInfo === undefined) {
    throw new Error(
      '[f147df3e] json.data[0].lastTransactions[0].signedTransactionInfo is undefined',
    );
  }

  console.log(`[c5dabbcc] ${signedTransactionInfo}`);

  const data1 = jwt.decode(signedTransactionInfo) as AppleStoreKitSubscriptionData;

  /* 
  sanitized version:
  {
    "transactionId": "220002344001105",
    "originalTransactionId": "220002344001105",
    "webOrderLineItemId": "220001000009784",
    "bundleId": "uk.co.guardian.Feast",
    "productId": "uk.co.guardian.Feast.monthly",
    "subscriptionGroupIdentifier": "21396030",
    "purchaseDate": 1732526628000,
    "originalPurchaseDate": 1732526630000,
    "expiresDate": 1733736228000,
    "quantity": 1,
    "type": "Auto-Renewable Subscription",
    "appAccountToken": "51f7092f-8b2d-0000-86b5-60352eb62d8e",
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

  return Promise.resolve(data1);
}

const appleSubscriptionToOriginalTransactionId = (subscription: Subscription): string => {
  const latest_receipt_info = subscription.applePayload?.latest_receipt_info as AppleLatestReceiptInfo;
  if (latest_receipt_info.length === 0) {
    throw new Error('[3b5a2b0d] latest_receipt_info is empty');
  }
  const transactionId = latest_receipt_info[0].transaction_id;
  return transactionId;
} 

export const appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline = async (
    subscription: Subscription,
): Promise<AppleStoreKitSubscriptionDataDerivationForFeastPipeline | null> => {
  /*
      This function takes a Subscription and returns a derivation of 
      the data that is retrieved from the Apple API
      at https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
  */

  console.log(`[940dc079] ${new Date()}`);

  const transactionId = appleSubscriptionToOriginalTransactionId(subscription);

  const appBundleId = await getConfigValue<string>(
    'feastAppleStoreKitConfigAppBunbleId',
  );

  console.log(`[52c0e2ef] appBundleId: ${appBundleId}, transactionId: ${transactionId}`);

  const appleStoreKitSubscriptionData: AppleStoreKitSubscriptionData | null = await transactionIdToAppleStoreKitSubscriptionData(appBundleId, transactionId);

  if (appleStoreKitSubscriptionData === null) {
    return Promise.resolve(null);
  }

  console.log(`[7f53de39] appleStoreKitSubscriptionData: ${JSON.stringify(appleStoreKitSubscriptionData)}`);

  const country = storefrontToCountry(appleStoreKitSubscriptionData.storefront);
  const currency = appleStoreKitSubscriptionData.currency;
  const paymentFrequency = productIdToPaymentFrequency(appleStoreKitSubscriptionData.productId);

  /*
      appleSubscriptionData (anonymized)
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

      Sample of AppleStoreKitSubscriptionDataDerivationForFeastPipeline
      {
          "transactionId": "2200001105",
          "productId": "uk.co.guardian.Feast.monthly",
          "storefront": "GBR",
          "currency": "GBP",
      }
  */

  return {
    transactionId,
    country,
    currency,
    paymentFrequency,
  };
};

export const transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra = async (appBundleId: string, transactionId: string): Promise<AppleStoreKitSubscriptionDataDerivationForExtra | null> => {
  // This function builds a AppleStoreKitSubscriptionData, and just adds the guType key to make it a 
  // AppleStoreKitSubscriptionDataDerivationForExtra

  console.log(`[e2b0930d] appBundleId: ${appBundleId}, transactionId: ${transactionId}`);

  const data1: AppleStoreKitSubscriptionData | null = await transactionIdToAppleStoreKitSubscriptionData(appBundleId, transactionId);
  if (data1 === null) {
    return Promise.resolve(null);
  }
  const data2: AppleStoreKitSubscriptionDataDerivationForExtra = {
    guType: "apple-extra-2025-04-29",
    ...data1
  }
  return Promise.resolve(data2)
}