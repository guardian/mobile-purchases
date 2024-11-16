
In this document we are going to document the mechanism by which we query the apple store and the google play store to retreive the full version of a subscription.

Because of differences between the two stores, we are going to document them separately, starting with the Apple App Store. 

## Retrieving subscriptions from the Apple App Store.

### Introduction

Subscriptions that are stored in and retrieved from the Subscription Dynamo table have the following schema

```
interface AppleReceiptInfo {
    subscriptionId: string,
    startTimestamp: string,
    endTimestamp: string,
    cancellationTimestamp: string | undefined,
    autoRenewing: boolean,
    productId: string,
    platform: string | undefined,
    freeTrial: boolean | undefined,
    billingPeriod: string | undefined,
    googlePayload?: any,
    receipt?: string,
    applePayload?: any,
    ttl?:number,
    tableName: string = "subscriptions"
}
```

(Subscriptions are defined by a class, instead of an interface, but for the purpose of this text, they are equivalent).

An example of an apple subscription is

```
{
    "subscriptionId": "6a65bff547d1bb76",
    "startTimestamp": "2024-11-13T12:43:28.000Z",
    "endTimestamp": "2024-11-27T12:43:27.000Z",
    "autoRenewing": true,
    "productId": "uk.co.guardian.Feast.yearly",
    "platform": "ios-feast",
    "freeTrial": true,
    "billingPeriod": "P1Y",
    "googlePayload": null,
    "receipt": "MIIUcAYJKOEvz8G+BQ/PuMA==",
    "applePayload": {
        "latest_receipt_info": [
            {
                "transaction_id": "6a65bff547d1bb76",
                "in_app_ownership_type": "PURCHASED",
                "quantity": "1",
                "original_transaction_id": "6a65bff547d1bb76",
                "subscription_group_identifier": "21396030",
                "app_account_token": "275aa3f6-bb34-40e4-adaf-3cb67a982a04",
                "purchase_date_pst": "2024-11-13 04:43:27 America/Los_Angeles",
                "original_purchase_date_ms": "1731501808000",
                "is_in_intro_offer_period": "true",
                "expires_date": "2024-11-27 12:43:27 Etc/GMT",
                "original_purchase_date_pst": "2024-11-13 04:43:28 America/Los_Angeles",
                "is_trial_period": "true",
                "expires_date_pst": "2024-11-27 04:43:27 America/Los_Angeles",
                "original_purchase_date": "2024-11-13 12:43:28 Etc/GMT",
                "expires_date_ms": "1732711407000",
                "purchase_date_ms": "1731501807000",
                "product_id": "uk.co.guardian.Feast.yearly",
                "purchase_date": "2024-11-13 12:43:27 Etc/GMT",
                "web_order_line_item_id": "55111322937957358"
            }
        ],
        "environment": "Production",
        "receipt": {
            "in_app": [
                {
                    "transaction_id": "6a65bff547d1bb76",
                    "in_app_ownership_type": "PURCHASED",
                    "quantity": "1",
                    "original_transaction_id": "6a65bff547d1bb76",
                    "purchase_date_pst": "2024-11-13 04:43:27 America/Los_Angeles",
                    "original_purchase_date_ms": "1731501808000",
                    "is_in_intro_offer_period": "true",
                    "expires_date": "2024-11-27 12:43:27 Etc/GMT",
                    "original_purchase_date_pst": "2024-11-13 04:43:28 America/Los_Angeles",
                    "is_trial_period": "true",
                    "expires_date_pst": "2024-11-27 04:43:27 America/Los_Angeles",
                    "original_purchase_date": "2024-11-13 12:43:28 Etc/GMT",
                    "expires_date_ms": "1732711407000",
                    "purchase_date_ms": "1731501807000",
                    "product_id": "uk.co.guardian.Feast.yearly",
                    "purchase_date": "2024-11-13 12:43:27 Etc/GMT",
                    "web_order_line_item_id": "55111322937957358"
                }
            ],
            "adam_id": 6468674686,
            "receipt_creation_date": "2024-11-13 12:43:35 Etc/GMT",
            "original_application_version": "849",
            "app_item_id": 6468674686,
            "original_purchase_date_ms": "1730021220466",
            "request_date_ms": "1731501818920",
            "original_purchase_date_pst": "2024-10-27 02:27:00 America/Los_Angeles",
            "original_purchase_date": "2024-10-27 09:27:00 Etc/GMT",
            "receipt_creation_date_pst": "2024-11-13 04:43:35 America/Los_Angeles",
            "receipt_type": "Production",
            "bundle_id": "uk.co.guardian.Feast",
            "receipt_creation_date_ms": "1731501815000",
            "request_date": "2024-11-13 12:43:38 Etc/GMT",
            "version_external_identifier": 870187832,
            "request_date_pst": "2024-11-13 04:43:38 America/Los_Angeles",
            "download_id": null,
            "application_version": "877"
        },
        "latest_receipt": "MIIUcAYJKOEvz8G+BQ/PuMA==",
        "pending_renewal_info": [
            {
                "auto_renew_product_id": "uk.co.guardian.Feast.yearly",
                "original_transaction_id": "6a65bff547d1bb76",
                "product_id": "uk.co.guardian.Feast.yearly",
                "auto_renew_status": "1"
            }
        ],
        "status": 0
    },
    "ttl": 1811421807,
    "tableName": "subscriptions"
}
```

One interesting attribute is `receipt` which holds a rather opaque piece of information that is base64 encoded.

The `applePayload` attribute, which is Apple dependent has the following apparent schema 

```

interface applePayload {
    latest_receipt_info: object[]
    environment: string
    receipt: object
    latest_receipt: string
    pending_renewal_info: object[]
    status: number
}
```

### Inside callValidateReceipt

Let's have a look at 

```
function callValidateReceipt(receipt: string, app: App = App.Live, forceSandbox: boolean = false): Promise<IHttpClientResponse>
```

This function takes a receipt: string, the name of an app, among the following options, and a flag indicating whether or not the sandbox should be used. (This flag is used to possibly override the fact that the endpoint is decided by the value of Stage.)

```
export enum App {
    Live = "live",
    Puzzles = "puzzles",
    Editions = "editions",
    Feast = "feast"
}
```

This function then either throws an error or promises a IHttpClientResponse, meaning

```
interface IHttpClientResponse {
    message: http.IncomingMessage;
    readBody(): Promise<string>;
}
```

The only moment we ever use `callValidateReceipt` is like this:

```
callValidateReceipt(receipt, app)
    .then(response => response.readBody())
    .then(body => JSON.parse(body))
    .then(body => body as AppleValidationServerResponse)
```

Meaning that we immediately turn `IHttpClientResponse` into `AppleValidationServerResponse`

### What is AppleValidatedReceiptServerInfo

In a nutshell `AppleValidatedReceiptServerInfo` contains the info we are looking for when performing a validation of the receipt, but the schema of such a data is ill defined and `AppleValidationServerResponse` tries and provide a unique interface for the answer.

```
interface AppleValidationServerResponse {
    auto_renew_status: 0 | 1,
    "is-retryable"?: boolean,
    latest_receipt?: string,
    latest_receipt_info?: AppleValidatedReceiptServerInfo | AppleValidatedReceiptServerInfo[],
    latest_expired_receipt_info?: AppleValidatedReceiptServerInfo,
    pending_renewal_info?: PendingRenewalInfo[],
    receipt?: AppleValidatedReceiptServerInfo,
    status: number
}
```

### The operations of AppleValidationServerResponse

*

We have `retryInSandboxIfNecessary` 

```
retryInSandboxIfNecessary(parsedResponse: AppleValidationServerResponse, receipt: string, options: ValidationOptions): Promise<AppleValidationServerResponse>
```

if we want to take a give another go at getting a `AppleValidationServerResponse`

*

We have `checkResponseStatus` 

```
checkResponseStatus(response: AppleValidationServerResponse): AppleValidationServerResponse
```

which either return the `AppleValidationServerResponse` or throws and error.

### Transforming AppleValidationServerResponse

`AppleValidationServerResponse` is a format that tries an isolate from the messy presentation of `AppleValidatedReceiptServerInfo`, but is not its final form. The final form is `AppleValidationResponse`. To get that we use the ony non trivial function that takes a `AppleValidationServerResponse`

```
toSensiblePayloadFormat(response: AppleValidationServerResponse, receipt: string): AppleValidationResponse[]
```

`toSensiblePayloadFormat` is a pure function that returns a `AppleValidationResponse`.

```
interface AppleValidationResponse {
    isRetryable: boolean,
    latestReceipt: string,
    latestReceiptInfo: AppleValidatedReceiptInfo,
    originalResponse: any
}
```

where `originalResponse` is the `AppleValidationServerResponse` that was used as input to the function.

### Getting a AppleValidationServerResponse

We do not actually have a function that returns a `AppleValidationServerResponse`, instead we have a function

```
validateReceipt(receipt: string, options: ValidationOptions, app: App = App.Live): Promise<AppleValidationResponse[]>
```

### Getting the subscription from Apple

The only functions that are taking a `AppleValidationResponse` as input are

```
toResponse(validationResponse: AppleValidationResponse): AppleSubscriptionStatusResponse # in appleSubStatus.ts
toAppleSubscription(response: AppleValidationResponse): Subscription # in apple.ts
```

We now have a path from a DynamoDB Subscription object, and an Apple Subscription

```
                                     (validateReceipt)                                (toAppleSubscription)
DynamoDB Subscription -> receipt -------------------------> AppleValidationResponse -------------------------> Apple Subscription
```
