import aws = require("../utils/aws");
import S3 from 'aws-sdk/clients/s3'
import {Stage} from "../utils/appIdentity";

import {androidpublisher, auth} from '@googleapis/androidpublisher';

export type GoogleSubscription = {
    // Time at which the subscription was granted. Not set for pending subscriptions (subscription was created but awaiting payment during signup)
    startTime: Date | null,
    // Time at which the subscription expired or will expire unless the access is extended (eg. renews)
    expiryTime: Date,
    // The time at which the subscription was canceled by the user. The user might still have access to the subscription after this time (defer to `expiryTime` above)
    userCancellationTime: Date | null,
    // If the subscription is currently set to auto-renew, e.g. the user has not canceled the subscription
    autoRenewing: boolean,
    // The purchased product ID (for example, 'guardian.subscription.annual.meteroffer'.) Note that this was previously referred to as the `subscriptionId`
    productId: string,
    // Subscription period, specified in ISO 8601 format (P1M, P6M, P1Y, etc.)
    billingPeriodDuration: string,
    // Whether the subscription is currently benefitting from a free trial
    freeTrial: boolean
    // Whether the subscription was taken out as a test purchase
    testPurchase: boolean
}

// Given a `purchaseToken` and `packageName`, attempts to build a `GoogleSubscription` by:
// 1. Looking up the `SubscriptionPurchaseV2` from the `android-publisher` API: https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get
// 2. Assuming that the purchase is of _exactly one_ subscription product
// 3. Looking up detailed information about the purchased subscription product from the `android-publisher` API: https://developers.google.com/android-publisher/api-ref/rest/v3/monetization.subscriptions/get
export async function fetchGoogleSubscription(
    purchaseToken: string,
    packageName: string
): Promise<GoogleSubscription> {
    try {
        const client =
            await initialiseAndroidPublisherClient()

        const purchase =
            await client.purchases.subscriptionsv2.get({ packageName, token: purchaseToken })

        // A subscription purchase refers to one or many underlying products ("line items".) However, by convention (and by
        // constraining/controling the UX within the app), we will always assume that a subscription purchase refers to exactly
        // one product.
        if (purchase.data.lineItems?.length != 1) {
            throw Error("The subscription purchase must refer to exactly one product")
        }

        const product =
            purchase.data.lineItems[0]

        const startTime =
            purchase.data.startTime ?? null

        const expiryTime =
            product.expiryTime

        if (!expiryTime) {
            throw Error("The subscription purchase does not have an expiry time")
        }

        const userCancellationTime =
            purchase.data.canceledStateContext?.userInitiatedCancellation?.cancelTime ?? null

        const autoRenewing =
            product.autoRenewingPlan?.autoRenewEnabled ?? false
        
        const testPurchase =
            purchase.data?.testPurchase ? true : false

        const productId =
            product.productId

        if (!productId) {
            throw Error("The product does not have an ID")
        }

        const basePlanId =
            product.offerDetails?.basePlanId

        if (!basePlanId) {
            throw Error("Unable to determine the base plan for the product")
        }

        const subscription =
            await client.monetization.subscriptions.get({ packageName, productId } )

        const basePlan =
            subscription.data.basePlans?.find(x => x.basePlanId == basePlanId)

        if (!basePlan) {
            throw Error("Unable to determine the base plan for the product")
        }

        const billingPeriodDuration =
            basePlan.autoRenewingBasePlanType?.billingPeriodDuration ??
            basePlan.prepaidBasePlanType?.billingPeriodDuration

        if (!billingPeriodDuration) {
            throw Error("Unable to determine a billing period duration for the base plan")
        }

        // It does not appear to be possible to determine if a subscription currently benefits from a free trial in version 2 of the API, without maintaining 
        // additional state or reference data in our own system. This was not the case in version 1 of the API (https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions/get), 
        // where a `paymentState` value of `2` would directly signal the free trial status, however, `paymentState` is not present in version 2 (https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2/get).
        //
        // We are fixing the `freeTrial` status to `false` here as we currently offer no subscription products on the Android platform that come with free trials.
        //
        // See: https://github.com/android/play-billing-samples/issues/585#issuecomment-1788695432
        // See: https://stackoverflow.com/a/76867605
        // See: https://developer.android.com/google/play/billing/compatibility (search in-page for "paymentState".)
        const freeTrial = false

        return {
            startTime: parseNullableDate(startTime),
            expiryTime: new Date(expiryTime),
            userCancellationTime: parseNullableDate(userCancellationTime),
            autoRenewing,
            productId,
            billingPeriodDuration,
            freeTrial,
            testPurchase
        }
    } catch (error: any) {
        if (error?.status == 400 || error?.status == 404 || error?.status == 410) {
            console.error(`fetchGoogleSubscription error: invalid purchase token; subscription not found; or no such package name (status = ${error.status})`, error)
        } else {
            console.error(`fetchGoogleSubscription error:`, error)
        }
        throw error
    }

}

function parseNullableDate(date: string | null): Date | null {
    return date === null ? null : new Date(date)
}

async function initialiseAndroidPublisherClient() {
    const accessToken =
        await getAccessToken(getParams(Stage))

    const authClient =
        new auth.OAuth2({credentials: {access_token: accessToken.token}})

    return androidpublisher({version: "v3", auth: authClient})
}

interface AccessToken {
    token: string,
    date: Date
}

function getParams(stage: string): S3.Types.GetObjectRequest {
  return {
      Bucket: "gu-mobile-access-tokens",
      Key: `${stage}/google-play-developer-api/access_token.json`
  }
}

function getAccessToken(params: S3.Types.GetObjectRequest) : Promise<AccessToken> {
    return aws.s3.getObject(params).promise()
        .then( s3OutPut => {
            if(s3OutPut.Body) {
                return JSON.parse(s3OutPut.Body.toString())
            } else {
                throw Error("S3 output body was not defined")
            }
        })
        .catch( error => {
            console.log(`Failed to get access token from S3 due to: ${error}`);
            throw error
        })
}
