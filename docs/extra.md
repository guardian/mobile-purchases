### Introducing the extra field

The `extra` field [1], was introduced by Pascal in 2025 as a temporary measure to help Data Design get extra data about subscriptions without and before the project to redesign the entire system.

The two tables that have received an extra field are

- mobile-purchases-PROD-subscriptions
- mobile-purchases-PROD-subscription-events-v2

The extra field add data to both Apple and Android subscriptions, both using the `extra` field but the object being added is different between the two platforms.

[1] Ok, ok, by now I can see it might now have been the absolute best name.

### The Apple/iOS extra field

The apple extra object is retrieved from Apple using the [api-storekit.ts](https://github.com/guardian/mobile-purchases/blob/a67a7d2246342bb16d635ace4f407c66ea7d0b28/typescript/src/services/api-storekit.ts)

Example (anonymised)

```
{
    "guType": "apple-extra-2025-04-29",
    "transactionId": "180002815908204",
    "originalTransactionId": "180001049822339",
    "webOrderLineItemId": "180001274909722",
    "bundleId": "uk.co.guardian.iphone2",
    "productId": "uk.co.guardian.gla.1month.2018May.withFreeTrial",
    "subscriptionGroupIdentifier": "20450880",
    "purchaseDate": 1755362890000,
    "originalPurchaseDate": 1630236283000,
    "expiresDate": 1758041290000,
    "quantity": 1,
    "type": "Auto-Renewable Subscription",
    "inAppOwnershipType": "PURCHASED",
    "signedDate": 1755334128921,
    "environment": "Production",
    "transactionReason": "RENEWAL",
    "storefront": "AUS",
    "storefrontId": "143460",
    "price": 14990,
    "currency": "AUD",
    "appTransactionId": "704334945917031057"
}
```

The data we get from the Apple API is the above object without the `guType` attribute. That attribute is added to the object we get from Apple to indicate that the object is companion of Apple subscription. The value is always "apple-extra-2025-04-29".

### The Apple/iOS extra field (missing subscription data)

It is not always possible to build a `apple-extra-2025-04-29` because in rare occasions the apple API replies

```
{
  "errorCode": 4040010,
  "errorMessage": "Transaction id not found."
}
```

For those we have the following dedicated object

```
{
    "guType": "apple-missing-5cea592e",
    "originalTransactionId": "180001049822339",
    "bundleId": "uk.co.guardian.iphone2",
}
```

Note the dedicated `guType`: "apple-missing-5cea592e"

### The Google/Android extra field

The extra object for Android is constructed in [google-subscription-extra.ts](https://github.com/guardian/mobile-purchases/blob/a67a7d2246342bb16d635ace4f407c66ea7d0b28/typescript/src/services/google-subscription-extra.ts)

Unlike the extra object for Apple where we just call the API once and add the `guType` attribute to the object, for Google, it take more hoops.

First we start with a `packageName`, a purchase `purchaseToken` and a `productId`. And example is

- packageName: "com.guardian"
- purchaseToken: "Example-kokmikjooafaEUsuLAO3RKjfwtmyQ",
- productId: "uk.co.guardian.feast.access"

We also need an access token that is retrieved from S3. There is a process which generates the access token and drops it to S3.

Using the `packageName` and the `purchaseToken` we retrieve a subscription (first call to the Google API). Using the subscription we retrieve a `subscriptionProduct` (second call to the Google API). Using the subscription product we determine the offer tags.

Subscription example:

```
{
  "kind": "androidpublisher#subscriptionPurchaseV2",
  "startTime": "2023-09-26T15:11:54.434Z",
  "regionCode": "GB",
  "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
  "latestOrderId": "GPA.3386-9869-8781-40466..22",
  "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
  "lineItems": [
    {
      "productId": "guardian.subscription.month.meteredoffer",
      "expiryTime": "2025-09-26T15:10:44.400Z",
      "autoRenewingPlan": {
        "autoRenewEnabled": true,
        "recurringPrice": {
          "currencyCode": "GBP",
          "units": "11",
          "nanos": 990000000
        },
        "priceChangeDetails": {
          "newPrice": {
            "currencyCode": "GBP",
            "units": "11",
            "nanos": 990000000
          },
          "priceChangeMode": "OPT_OUT_PRICE_INCREASE",
          "priceChangeState": "APPLIED"
        }
      },
      "offerDetails": {
        "basePlanId": "p1m",
        "offerId": "offer1month"
      },
      "latestSuccessfulOrderId": "GPA.3386-9869-8781-40466..22"
    }
  ]
}
```

Subscription product example:

```
{
    "packageName": "com.guardian",
    "productId": "uk.co.guardian.subscription.3",
    "basePlans": [
        {
            "basePlanId": "p1m",
            "regionalConfigs": [
                {
                    "regionCode": "AE",
                    "newSubscriberAvailability": true,
                    "price": {
                        "currencyCode": "AED",
                        "units": "22",
                        "nanos": 930000000
                    }
                },
                (...) # many instances
                {
                    "regionCode": "ZM",
                    "newSubscriberAvailability": true,
                    "price": {
                        "currencyCode": "USD",
                        "units": "4",
                        "nanos": 660000000
                    }
                },
                {
                    "regionCode": "ZW",
                    "newSubscriberAvailability": true,
                    "price": {
                        "currencyCode": "USD",
                        "units": "4",
                        "nanos": 660000000
                    }
                }
            ],
            "state": "ACTIVE",
            "autoRenewingBasePlanType": {
                "billingPeriodDuration": "P1M",
                "gracePeriodDuration": "P30D",
                "resubscribeState": "RESUBSCRIBE_STATE_ACTIVE",
                "prorationMode": "SUBSCRIPTION_PRORATION_MODE_CHARGE_ON_NEXT_BILLING_DATE",
                "legacyCompatible": true,
                "legacyCompatibleSubscriptionOfferId": "freetrial",
                "accountHoldDuration": "P30D"
            },
            "otherRegionsConfig": {
                "usdPrice": {
                    "currencyCode": "USD",
                    "units": "3",
                    "nanos": 130000000
                },
                "eurPrice": {
                    "currencyCode": "EUR",
                    "units": "2",
                    "nanos": 950000000
                },
                "newSubscriberAvailability": true
            }
        }
    ],
    "listings": [
        {
            "title": "Premium Tier Subscription",
            "languageCode": "en-GB",
            "description": "Premium Tier Subscription"
        },
        {
            "title": "Premium Tier Subscription",
            "languageCode": "en-US",
            "description": "Premium Tier Subscription"
        }
    ],
    "taxAndComplianceSettings": {
        "eeaWithdrawalRightType": "WITHDRAWAL_RIGHT_SERVICE"
    }
}
```

The resulting extra object has the form

```
{
    guType: "google-extra-2025-06-26",
    packageName,
    purchaseToken,
    productId,
    subscription,
    offerTags,
}
```

Alike the Apple extra object, the Google/Android extra object has a an extra attribute called `guType` and value "google-extra-2025-06-26".

```
{
    "guType": "google-extra-2025-06-26",
    "packageName": "com.guardian",
    "purchaseToken": "kadmieppmanincgeejahkkbp.5de44e89-065b-4eba-9e59-bf655048ed09",
    "productId": "guardian.subscription.month.meteredoffer",
    "subscription": {
        "kind": "androidpublisher#subscriptionPurchaseV2",
        "startTime": "2020-10-17T11:29:43.457Z",
        "regionCode": "DE",
        "subscriptionState": "SUBSCRIPTION_STATE_ACTIVE",
        "latestOrderId": "GPA.3331-7311-8633-87504..58",
        "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        "lineItems": [
            {
                "productId": "com.guardian.subscription.monthly.10",
                "expiryTime": "2025-09-24T13:29:26.306Z",
                "autoRenewingPlan": {
                    "autoRenewEnabled": true,
                    "recurringPrice": {
                        "currencyCode": "EUR",
                        "units": "6",
                        "nanos": 990000000
                    }
                },
                "offerDetails": {
                    "basePlanId": "p1m",
                    "offerId": "freetrial"
                },
                "latestSuccessfulOrderId": "GPA.3331-7311-8633-87504..58"
            }
        ]
    },
    "offerTags": []
}
```

### The Google/Android extra field (expired subscription)

It is not always possible to build a `google-extra-2025-06-26` for an expired google subscription. For expired subscriptions we sometimes get the following error messages from Google

- "The subscription purchase is no longer available for query because it has been expired for too long."
- "The purchase token is no longer valid."

In order not to leave holes in the tables for those subscriptions (this was particularly relevant when backfilling) we have a special extra object for expired android subscriptions.

```
{
    "guType": "google-expired-4b7df973",
    "packageName": "com.guardian",
    "purchaseToken": "kadmieppmanincgeejahkkbp.5de44e89-065b-4eba-9e59-bf655048ed09",
    "productId": "guardian.subscription.month.meteredoffer",
}
```

Note the dedicated `guType`: "google-expired-4b7df973"
