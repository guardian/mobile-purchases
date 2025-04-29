import type { Subscription } from '../models/subscription';
import { forgeStoreKitBearerToken } from './apple-json-web-tokens';
import { productIdToPaymentFrequency, storefrontToCountry } from './apple-mappings';
const jwt = require('jsonwebtoken');

// AppleExtendedData is built from the answer from
// https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
// and contains information that are required to build an AcquisitionApiPayload
export interface AppleExtendedData {
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

interface AppleLatestReceiptInfoItem {
  transaction_id: string;
}
type AppleLatestReceiptInfo = AppleLatestReceiptInfoItem[];

interface AppleTransactionQueryResponse {
  transactionId: string;
  productId: string; // from which we are going to derive the paymentFrequency
  storefront: string; // storefront seems to be the country as three letter code
  currency: string; // currency as three letter code
}

export const appleSubscriptionToExtendedData = async (
    subscription: Subscription,
): Promise<AppleExtendedData> => {
  /*
        This function takes a Subscription and return the extra data that is retrieved from the Apple API
        at https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/{transactionId}
    */

  console.log(`[940dc079] ${new Date()}`);

  // This extraction will be abstracted in a function in a coming refactoring
  const latest_receipt_info = subscription.applePayload?.latest_receipt_info as AppleLatestReceiptInfo;
  if (latest_receipt_info.length === 0) {
    throw new Error('[3b5a2b0d] latest_receipt_info is empty');
  }
  const transactionId = latest_receipt_info[0].transaction_id;

  console.log(`[116fa7d4] transactionId: ${transactionId}`);

  const url = `https://api.storekit.itunes.apple.com/inApps/v1/subscriptions/${transactionId}`;
  console.log(`[5330931d] url: ${url}`);

  const token = await forgeStoreKitBearerToken();

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

  const data1 = jwt.decode(signedTransactionInfo);

  console.log(`[7f53de39] data1: ${JSON.stringify(data1)}`);

  // At this point we need to transform the signedTransactionInfo into a JSON object: a AppleTransactionQueryResponse

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

        Sample of AppleTransactionQueryResponse {
            "transactionId": "2200001105",
            "productId": "uk.co.guardian.Feast.monthly",
            "storefront": "GBR",
            "currency": "GBP",
        }

    */

  const appleResponse: AppleTransactionQueryResponse =
    data1 as AppleTransactionQueryResponse;

  const country = storefrontToCountry(appleResponse.storefront);
  const currency = appleResponse.currency;
  const paymentFrequency = productIdToPaymentFrequency(appleResponse.productId);
  return {
    transactionId,
    country,
    currency,
    paymentFrequency,
  };
};
