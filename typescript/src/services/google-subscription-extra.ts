import type S3 from 'aws-sdk/clients/s3';
import aws = require('../utils/aws');

// Author: Pascal
// This file was introduced in July 2025 to implement the service that queries the Google API
// to retrieve subscription and subscription product metadata in order to populate
// the `extra` field for android records.

// -----------------------------------------------

export interface AccessToken {
    token: string;
    date: Date;
}

export function getParams(stage: string): S3.Types.GetObjectRequest {
    return {
        Bucket: 'gu-mobile-access-tokens',
        Key: `${stage}/google-play-developer-api/access_token.json`,
    };
}

export function getAccessToken(stage: string): Promise<AccessToken> {
    const params: S3.Types.GetObjectRequest = getParams(stage);
    return aws.s3
        .getObject(params)
        .promise()
        .then((s3OutPut) => {
            if (!s3OutPut.Body) {
                throw Error('S3 output body was not defined');
            }
            return JSON.parse(s3OutPut.Body.toString()) as AccessToken;
        })
        .catch((error) => {
            console.log(`Failed to get access token from S3 due to: ${error}`);
            throw error;
        });
}

interface E1CommonPrice {
    currencyCode: string;
    units: string;
    nanos: number;
}

interface E1GoogleSubscriptionLineItemAutoRenewingPlan {
    autoRenewEnabled: boolean;
    recurringPrice: E1CommonPrice;
    // priceChangeDetails // not modelled for the moment
}

interface E1GoogleSubscriptionLineItemOfferDetails {
    basePlanId: string;
    offerId: string;
}

interface E1GoogleSubscriptionLineItem {
    productId: string;
    expiryTime: string;
    autoRenewingPlan: E1GoogleSubscriptionLineItemAutoRenewingPlan;
    offerDetails: E1GoogleSubscriptionLineItemOfferDetails;
    latestSuccessfulOrderId: string;
}

interface E1GoogleSubscription {
    kind: string;
    startTime: string;
    regionCode: string;
    subscriptionState: string;
    latestOrderId: string;
    acknowledgementState: string;
    lineItems: E1GoogleSubscriptionLineItem[];
}
interface E1GoogleSubscriptionProductBasePlanRegionalConfig {
    regionCode: string;
    newSubscriberAvailability: boolean;
    price: E1CommonPrice;
}
interface E1GoogleSubscriptionProductBasePlan {
    basePlanId: string;
    regionalConfigs: E1GoogleSubscriptionProductBasePlanRegionalConfig[];
    state: string;
    // autoRenewingBasePlanType // not modelled for the moment
    // otherRegionsConfig       // not modelled for the moment
}

interface E1GoogleSubscriptionListingItem {
    title: string;
    languageCode: string;
    description: string;
}

interface E1GoogleSubscriptionProduct {
    packageName: string;
    productId: string;
    basePlans: E1GoogleSubscriptionProductBasePlan[];
    listings: E1GoogleSubscriptionListingItem[];
    // taxAndComplianceSettings // not modelled
}

const extractGoogleSubscription = async (
    accessToken: AccessToken,
    purchaseToken: string,
): Promise<E1GoogleSubscription | undefined> => {
    console.log(`[e0b04200] query google api for subscription`);

    // Sample data for the moment
    const packageName = 'com.guardian';

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptionsv2/tokens/${purchaseToken}`;
    console.log(`[26b172df] url: ${url}`);

    const params = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken.token}`,
        },
    };

    let subscription;

    try {
        const response = await fetch(url, params);
        if (response.ok) {
            subscription = (await response.json()) as E1GoogleSubscription;
        } else {
            console.error(`[19e802a9] error: fetch failed: ${response.status}`);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`[24c359f8] error: fetch failed: ${error.message}`);
        } else {
            console.error(`[34bff1ac] error: fetch failed: ${JSON.stringify(error)}`);
        }
        throw error; // <-- rethrow the original error
    }

    return Promise.resolve(subscription);
};

const extractGoogleSubscriptionProduct = async (
    accessToken: AccessToken,
    productId: string,
): Promise<E1GoogleSubscriptionProduct | undefined> => {
    console.log(`[f779539] query google api for subscription product`);

    // Example of productId: 'guardian.subscription.month.meteredoffer'
    // See docs/google-identifiers.md for details

    const packageName = 'com.guardian';

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/subscriptions/${productId}`;
    console.log(`[643eb5b5] url: ${url}`);

    const params = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken.token}`,
        },
    };

    let subscriptionProduct;

    try {
        const response = await fetch(url, params);
        if (response.ok) {
            subscriptionProduct = (await response.json()) as E1GoogleSubscriptionProduct;
        } else {
            console.error(`[ce8c6f32] error: fetch failed: ${response.status}`);
        }
    } catch (error) {
        if (error instanceof Error) {
            console.error(`[a726e01d] error: fetch failed: ${error.message}`);
        } else {
            console.error(`[a24ac23e] error: fetch failed: ${JSON.stringify(error)}`);
        }
        throw error; // <-- rethrow the original error
    }

    return Promise.resolve(subscriptionProduct);
};

interface E1Android {
    guType: 'google-extra-2025-06-26';
    packageName: string;
    purchaseToken: string;
    productId: string;
    subscription: E1GoogleSubscription;
    offerTags: string[];
}

const extractOfferTagsFromSubscriptionProduct = (
    subscriptionProduct: E1GoogleSubscriptionProduct | undefined,
): string[] => {
    // We are not performing the extraction for the moment while we are waiting for a confirmation of
    // the location in the E1GoogleSubscriptionProduct
    return [];
};

const buildExtraObject = async (
    accessToken: AccessToken,
    purchaseToken: string,
    productId: string,
): Promise<E1Android | undefined> => {
    const subscription = await extractGoogleSubscription(accessToken, purchaseToken);
    if (subscription === undefined) {
        return Promise.resolve(undefined);
    }
    console.log(`[26b172df] subscription: ${JSON.stringify(subscription)}`);
    const subscriptionProduct = await extractGoogleSubscriptionProduct(accessToken, productId);
    console.log(`[d9d390c4] subscription product: ${JSON.stringify(subscriptionProduct)}`);
    const offerTags = extractOfferTagsFromSubscriptionProduct(subscriptionProduct);
    console.log(`[68041474] offer tags: ${JSON.stringify(offerTags)}`);
    const extraObject: E1Android = {
        guType: 'google-extra-2025-06-26',
        packageName: 'com.guardian',
        purchaseToken,
        productId,
        subscription,
        offerTags,
    };
    return Promise.resolve(extraObject);
};

export async function build_extra_string(
    stage: string,
    purchaseToken: string,
    productId: string,
): Promise<string | undefined> {
    const accessToken: AccessToken = await getAccessToken(stage);
    try {
        const extraObject = await buildExtraObject(accessToken, purchaseToken, productId);
        console.log(`[6734a9c1] extra object: ${JSON.stringify(extraObject)}`);
        return Promise.resolve(JSON.stringify(extraObject));
    } catch (error) {
        if (error instanceof Error) {
            console.error(`[dab24062] error: building failed: ${error.message}`);
        } else {
            console.error(`[26b810d4] error: building failed: ${JSON.stringify(error)}`);
        }
        return Promise.resolve(undefined);
    }
}
