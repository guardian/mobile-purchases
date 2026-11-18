# Architecture

This service is a set of AWS lambdas, triggered by an API Gateway, SQS queues or Dynamo events. This allow us to scale very efficiently and very cheaply as well as getting retries for free when querying Apple and Google's services.

For clarity and convenience we specify the code paths to the entry point of the lambdas, and note that the paths are given from the root of the repository.

## Pubsub

Data enters the system via pubsub endpoints which are called by the Apple App Store and Google Play Store when subscription events happen (e.g. purchase, renewal, cancellation):

```

(Unless otherwise specified elements are in the mobile aws account)

                                                                                                                                                                                    ------------------------
                                                                                                                                                                                   | App Store & Play Store |
                                                                                                                                                                                    ------------------------
                                                                                                                                                                                           ^
                                                                                                                                                                                           |
                                                                                                                                                                                           | (fetch additional subscription data)
                                                                                                                                                                                           |
 ------------------------      HTTP via API Gateway        ----------------                                               ------------                                              -----------------------------                                         --------------------------------------------------------
| App Store & Play Store | -----------------------------> | Pubsub Lambdas | ------------------------------------------> | SQS Queues | -----------------------------------------> | Update subscription Lambdas | ------------------------------------> | Dynamo Table: mobile-purchases-PROD-subscriptions [08] |
 ------------------------                                  ----------------                                               ------------                                              -----------------------------                                        |               [extra]                                  |
                                             ( mobile-purchases-applepubsub-PROD       [09] )    ( mobile-purchases-PROD-apple-subscriptions-to-fetch (-dlq)        [13] )       ( mobile-purchases-apple-update-subscriptions-PROD        [03] )         --------------------------------------------------------
                                             ( mobile-purchases-googlepubsub-PROD      [10] )    ( mobile-purchases-PROD-google-subscriptions-to-fetch (-dlq)       [06] )       ( mobile-purchases-google-update-subscriptions-PROD       [02] )
                                             ( mobile-purchases-feastapplepubsub-PROD  [16] )    ( mobile-purchases-PROD-feast-apple-subscriptions-to-fetch (-dlq)  [05] )       ( mobile-purchases-feast-apple-update-subscriptions-PROD  [11] )
                                             ( mobile-purchases-feastgooglepubsub-PROD [17] )    ( mobile-purchases-PROD-feast-google-subscriptions-to-fetch (-dlq) [04] )       ( mobile-purchases-feast-google-update-subscriptions-PROD [01] )
                                                                |                                                                                                                          |
                                                                |                                                                                                                          |
                                                                |                                                                                                                          |                     -------------------------------------------------------------
                                                                |                                                                                                                           ------------------> | Dynamo table: mobile-purchases-PROD-user-subscriptions [12] |
                                                                |                                                                                                                              (feast only)      -------------------------------------------------------------
                                                                |                                                                                                                          |
                                                                |                                                                                                                          |
                                                                v                                                                                                                          |                    ------------
                                                 -----------------------------------------------------------------                                                                          -----------------> | SQS Queues |
                                                | Dynamo Table: mobile-purchases-PROD-subscription-events-v2 [07] |                                                                            (feast only)     ------------
                                                |               [extra]                                           |                                                                                            ( mobile-purchases-PROD-apple-historical-subscriptions (-dlq)  [14] )
                                                 -----------------------------------------------------------------                                                                                             ( mobile-purchases-PROD-google-historical-subscriptions (-dlq) [15] )
[09] Lambda/function
     name: mobile-purchases-applepubsub-PROD
         : mobile-purchases-applepubsub-CODE
     code: mpapi-next-gen/src/lambdas/applePubsub.ts

[10] Lambda/function
     name: mobile-purchases-googlepubsub-PROD (generate extra for table [07])
         : mobile-purchases-googlepubsub-CODE
     code: mpapi-next-gen/src/lambdas/googlePubsub.ts

[03] Lambda/function
     name: mobile-purchases-apple-update-subscriptions-PROD
     code: mpapi-next-gen/src/lambdas/appleUpdateSubscriptions.ts

[02] Lambda/function
     name: mobile-purchases-google-update-subscriptions-PROD
     code: mpapi-next-gen/src/lambdas/googleUpdateSubscriptions.ts

[01] Lambda/function
     name: mobile-purchases-feast-google-update-subscriptions-PROD
     code: mpapi-next-gen/src/lambdas/feastGoogleUpdateSubscriptions.ts

[11] Lambda/function
     name: mobile-purchases-feast-apple-update-subscriptions-PROD
     code: mpapi-next-gen/src/lambdas/feastAppleUpdateSubscriptions.ts

[16] Lambda/function
     name: mobile-purchases-feastapplepubsub-PROD
     code: mpapi-next-gen/src/lambdas/feastApplePubsub.ts

[17] Lambda/function
     name: mobile-purchases-feastgooglepubsub-PROD
     code: mpapi-next-gen/src/lambdas/feastGooglePubsub.ts

[13] SQS queue
     name: mobile-purchases-PROD-apple-subscriptions-to-fetch
         : mobile-purchases-PROD-apple-subscriptions-to-fetch-dlq

[06] SQS queue
     name: mobile-purchases-PROD-google-subscriptions-to-fetch
         : mobile-purchases-PROD-google-subscriptions-to-fetch-dlq

[05] SQS queue
     name: mobile-purchases-PROD-feast-apple-subscriptions-to-fetch
         : mobile-purchases-PROD-feast-apple-subscriptions-to-fetch-dlq

[04] SQS queue
     name: mobile-purchases-PROD-feast-google-subscriptions-to-fetch
         : mobile-purchases-PROD-feast-google-subscriptions-to-fetch-dlq

[14] SQS queue
     name: mobile-purchases-PROD-apple-historical-subscriptions
         : mobile-purchases-PROD-apple-historical-subscriptions-dlq

[15] SQS queue
     name: mobile-purchases-PROD-google-historical-subscriptions
         : mobile-purchases-PROD-google-historical-subscriptions-dlq

[07] Dynamo table
     name: mobile-purchases-PROD-subscription-events-v2 [extra]

[08] Dynamo table
     name: mobile-purchases-PROD-subscriptions [extra]

[12] Dynamo table
     name: mobile-purchases-PROD-user-subscriptions

```

This pattern is repeated for the Apple and Google live apps, as well as Feast apps.

In addition to writing to the subscriptions Dynamo table, the Feast lambdas also attempt to link to a user by reading a custom field from the receipt data which is exchanged with Braze for an Identity ID. This is then written to the user-subscriptions table. The live apps do not work this way and the user-subscriptions record is added by the link lambdas (see below).

**Note:** Apple subscriptions are revalidated on a schedule by the apple-revalidate-receipts lambda. This lambda reads from the subscriptions Dynamo table and pushes items to the subscriptions-to-fetch SQS queues.

**Note:** Tokens for the Play Store are refreshed on a schedule by the mobile-purchases-googleoauth lambda and accessed from an s3 bucket.

**Note:** The [extra] attribute added to some tables is described in [extra.md](extra.md).

## Linking

The mobile apps link an In App Purchase with a Guardian user by calling the link endpoints. The user must be signed in for this to happen. For the live apps this is the only way users are linked to subscriptions. For Feast, this endpoint is _sometimes_ called as there are cases where the linking cannot happen using the receipt data (e.g. promo codes on iOS).

```

(Unless otherwise specified elements are in the mobile aws account)

                                     ------------                                                               -----------------------------
                                    | SQS Queues | ----------------------------------------------------------> | Update subscription Lambdas |
                                     ------------                                                               -----------------------------
                                    ( mobile-purchases-PROD-apple-historical-subscriptions  (-dlq) [06] )      ( mobile-purchases-apple-update-subscriptions-PROD  [04] )
                                    ( mobile-purchases-PROD-google-historical-subscriptions (-dlq) [07] )      ( mobile-purchases-google-update-subscriptions-PROD [05] )
                                         ^
                                         |
                                         |
                                         |
 ---------------                   --------------                                                 -------------------------------------------------------------
| Mobile Device | --------------> | Link Lambdas | --------------------------------------------> | Dynamo table: mobile-purchases-PROD-user-subscriptions [03] |
 ---------------                   --------------                                                 -------------------------------------------------------------
                                  ( mobile-purchases-google-link-user-subscription-PROD [01] )
                                  ( mobile-purchases-apple-link-user-subscription-PROD  [02] )

[01] Lambda/function
     name: mobile-purchases-google-link-user-subscription-PROD
     code: mpapi-next-gen/src/lambdas/googleLinkUserSubscription.ts

[02] Lambda/function
     name: mobile-purchases-apple-link-user-subscription-PROD
     code: mpapi-next-gen/src/lambdas/appleLinkUserSubscription.ts

[03] Dynamo table
     name: mobile-purchases-PROD-user-subscriptions

[04] Lambda/function
     name: mobile-purchases-apple-update-subscriptions-PROD
     code: mpapi-next-gen/src/lambdas/appleUpdateSubscriptions.ts

[05] Lambda/function
     name: mobile-purchases-google-update-subscriptions-PROD
     code: mpapi-next-gen/src/lambdas/googleUpdateSubscriptions.ts

[06] SQS queue
     name: mobile-purchases-PROD-apple-historical-subscriptions
         : mobile-purchases-PROD-apple-historical-subscriptions-dlq

[07] SQS queue
     name: mobile-purchases-PROD-google-historical-subscriptions
         : mobile-purchases-PROD-google-historical-subscriptions-dlq

```

In some cases the subscription is queued for processing by pushing to the subscriptions-to-fetch SQS queues.

## User & subscription related events

Inserts into the user-subscriptions Dynamo table trigger the soft-opt-in-acquisitions lambda which in turn pushes onto SQS queues in the membership account to set SOI consents and send emails.

```

(Unless otherwise specified elements are in the mobile aws account)

                                              -------------------------------------------------------------
                                             | Dynamo table: mobile-purchases-PROD-user-subscriptions [02] |
                                              -------------------------------------------------------------
                                                            |
                                                            |
                                                       INSERT event
                                                  ( DynamoDBStreamEvent )
                                                            |
                                                            |
                                                            v
                                          -------------------------------------------------------------
                                         | Lambda: mobile-purchases-soft-opt-in-acquisitions-PROD [01] | ---------> [ (membership account) SQS: braze-emails-PROD ]
                                          -------------------------------------------------------------
                                                            | 
                                                            |
                                                            v
                                         [ (membership account) SQS: soft-opt-in-consent-setter-queue-PROD ]


[01] Lambda/function:
    name: mobile-purchases-soft-opt-in-acquisitions-PROD
    code: mpapi-next-gen/src/lambdas/softOptInAcquisitions.ts
    Works in conjunction with:
       - SQS Queue: mobile-purchases-soft-opt-in-acquisitions-DLQ-PROD
       - Lambda/function:
          name: mobile-purchases-soft-opt-in-acquisitions-dlq-processor-PROD
          code: mpapi-next-gen/src/lambdas/softOptInAcquisitionsDLQProcessor.ts

[02] Dynamo table
     name: mobile-purchases-PROD-user-subscriptions

```

Deletions from the subscriptions table (triggered by the TTL being reached) trigger the delete-user-subscription lambda. This severs the user-subscription record for this subscription and pushes onto a queue in the membership account to trigger a recalculation of SOI consents.

```

(Unless otherwise specified elements are in the mobile aws account)

                                   DELETE event
                                (triggered by TTL)
 --------------------------------------------------------              -------------------------------------------------------------
| Dynamo table: mobile-purchases-PROD-subscriptions [01] |----------> | Lambda: mobile-purchases-delete-user-subscription-PROD [03] |
 --------------------------------------------------------              -------------------------------------------------------------
                                                                                       |         |
                                                                                       |         |
                                                                                         DELETE       ----> [ (membership account) SQS queue: soft-opt-in-consent-setter-queue-PROD ]
                                                                                            |
                                                                                            |
                                                                                            v
                                                             -------------------------------------------------------------
                                                            | Dynamo table: mobile-purchases-PROD-user-subscriptions [02] |
                                                             -------------------------------------------------------------

[01] Dynamo table
     name: mobile-purchases-PROD-subscriptions [extra]

[02] Dynamo table
     name: mobile-purchases-PROD-user-subscriptions

[03] Lambda/function
     name: mobile-purchases-delete-user-subscription-PROD
     code: mpapi-next-gen/src/lambdas/deleteUserSubscription.ts


```

## Subscription status endpoints

The apps call endpoints to check the status of a subscription.

```

(Unless otherwise specified elements are in the mobile aws account)

 ---------------                   ---------------------------------------- ---------------------                    -----------------
| Mobile Device | --------------> | Lambda: mobile-purchases-apple-subscription-status-PROD [01] | ---------------> | Apple App Store |
 ---------------                   --------------------------------------------------------------                    -----------------

 ---------------                   ---------------------------------------------------------------                   -------------------
| Mobile Device | --------------> | Lambda: mobile-purchases-google-subscription-status-PROD [02] | --------------> | Google Play Store |
 ---------------                   ---------------------------------------------------------------                   -------------------

[01] Lambda/function
     name: mobile-purchases-apple-subscription-status-PROD
     code: mpapi-next-gen/src/lambdas/appleSubscriptionStatus.ts


[02] Lambda/function
     name: mobile-purchases-google-subscription-status-PROD
     code: mpapi-next-gen/src/lambdas/googleSubscriptionStatus.ts
```

**Note:** Tokens for the Play Store are refreshed on a schedule by the mobile-purchases-googleoauth lambda and accessed from an s3 bucket.


## The Feast Acquisition Pipeline

[The Guardian Feast app (recipes)](https://www.theguardian.com/help/insideguardian/2024/apr/17/introducing-the-feast-app), can be accessed using a user's Guardian account (this can be an existing account or an account created on the fly when login to the app for the first time), and then allows users to take a Feast subscription, directly from the app.

By a process that is not documented here, those subscriptions end up in the { User Subscription } dynamo table

The feast acquisition pipeline is a workflow we implented in 2024, that take subscriptions notifications from the User Subscriptions Dynamo table and relays them to Big Query through the Acquisition API which is itself a Event Bridge to BQ.

This page documents the various stages of this workflow, for future reference. Notably we document the Apple Subscription look up using JSON Web Tokens, which has no other occurence in all of mobile-purchases as well as the API call the the bq event handler which is also novel to this project.

### Architectural Diagram

```


                             --------------------
                            | User Subscriptions |
                             --------------------
                                |      ^     |
                                |      |     |         (1) : Modification event
                                |(1)   |(2)  |(3)      (2) : Retrieval request
                                |      |     |         (3) : Fetch subscription
                                v      |     v
                               ----------------
                              | Routing lambda |
                               ----------------
                                   |   |
                      |----(4) ----|   |----(7)----|
                      |                            |
                      |                            |
             [ Apple SQS Queue ]          [ Google SQS Queue ]
                      |                            |
                      |                            |
                      |                            |
                      v                            v
        -------------------------           -------------------------
       | Apple Processing Lambda |         | Google Processing Lambda |
        -------------------------           -------------------------
         |     ^              |               |          ^      |
         |     |              |               |          |      |
         |(5)  |(6)           |(10)           |(11)      |(9)   |(8)
         |     |              |               |          |      |
         v     |              |               |          |      v
        -----------           |               |        ------------
       | Apple API |          |               |       | Google API |
        -----------           |               |        ------------
                              |               |
                              |               |
                              |               |
                              v               v
                           [ Fact Acquisition API ] (membership accout)
                                     |
                                     |
                                     v
                              [ Event Bridge ]
                                     |
                                     |
                                     v
                              [ Big Query Table ]
```

### Diagram Elements

#### From User Subscriptions to the Routing Lambda.

The User Subscriptions is the table `mobile-purchases-PROD-user-subscriptions` in the `mobile` account.

```
account : mobile
table   : mobile-purchases-PROD-user-subscriptions
```

When a record is modified inside this table (where "modified" includes being added), an event is put on the queue [todo], that triggers the routing lambda.


#### Routing Lambda

```
account              : mobile
lambda function name : mobile-purchases-feast-acquisition-events-router-PROD
cf name              : FeastAcquisitionEventsRouterLambda
location             : typescript/src/feast/acquisition-events/google.ts
```

If the modification event is "insert", meaning that the event represents an item being inserted, and therefore a new subscription having been added to the table, then we read the subscription's id from the event and query the dynamo table to retrieve the record / subscription.

The subscription is then going to be introspected to determine if it was a Feast subscription or not, and if a Feast subscription, will be further introspected to determine the platform, iOS or Android, it originates from.

An event is dropped on the Apple SQS queue or Google SQS queue

#### Apple SQS queue

```
account     : mobile
queue       : mobile-purchases-PROD-feast-apple-acquisition-events-queue
queue (dlq) : mobile-purchases-PROD-feast-apple-acquisition-events-dlq
cf name     : FeastAppleAcquisitionEventsQueue
```

#### Google SQS queue

```
account     : mobile
queue       : mobile-purchases-PROD-feast-google-acquisition-events-queue
queue (dlq) : mobile-purchases-PROD-feast-google-acquisition-events-dlq
cf name     : FeastGoogleAcquisitionEventsQueue
```

#### Apple Processing Lambda

```
ssm parameters
/mobile-purchases/PROD/mobile/feast.apple.password
```

```
account              : mobile
lambda function name : mobile-purchases-feast-apple-acquisition-events-PROD
cf name              : FeastAppleAcquisitionEventsLambda
location             : typescript/src/feast/acquisition-events/apple.ts
```

For information about storekit and the signature, see [storekit-signatures.md](./storekit-signatures.md) 

#### Google Processing Lambda

```
account              : mobile
lambda function name : mobile-purchases-feast-google-acquisition-events-PROD
cf name              : FeastGoogleAcquisitionEventsLambda
location             : typescript/src/feast/acquisition-events/router.ts
```

#### Fact Acquisition API

The fact Aquisition API's end point is documented here: [acquisition-events-api](https://github.com/guardian/support-frontend/tree/main/support-lambdas/acquisition-events-api#acquisition-events-api). Unlike other urls, for instance the storekit url, the fact acquisition url is hidden in Parameter Store.

```
ssm parameters
/mobile-purchases/PROD/mobile/acquisitionApiUrl
/mobile-purchases/CODE/mobile/acquisitionApiUrl (not set up)
```

#### The fact_acquisition_event table

Is located here:

```
https://cloud.google.com/bigquery/?hl=en
Big Query Studio
    datatech-platform-prod
        datalake
            fact_acquisition_event
```


## Datalake export

The subscriptions, subscription-events-v2 and user-subscriptions Dynamo tables are exported to the datalake. This is orchestrated by lambdas triggered on a cron schedule. Data is exported to s3 by the lambdas and then transferred to GCS and ingested into a table, scheduled by Airflow.

The update-subscriptions lambdas push onto an SQS queue for each change and this historical data is exported by lambdas.

```

(Unless otherwise specified elements are in the mobile aws account)

 --------------------------------------                ------------------------------------------------------------------              ----              -----------------------------------------------------
| SQS: google-historical-subscriptions | -----------> | Lambda: mobile-purchases-export-google-historical-data-PROD [03] | -----------| S3 |----------> | datalake.mobile_subscription_historical_google [09] |
 --------------------------------------                ------------------------------------------------------------------                                -----------------------------------------------------

 -------------------------------------                 -----------------------------------------------------------------                                 ----------------------------------------------------
| SQS: apple-historical-subscriptions | ------------> | Lambda: mobile-purchases-export-apple-historical-data-PROD [04] | ------------| S3 |----------> | datalake.mobile_subscription_historical_apple [10] |
 -------------------------------------                 -----------------------------------------------------------------                                 ----------------------------------------------------

 -------------------------------------------           ---------------------------------------------------------------------                             ------------------------------------------
| Dynamo Table: subscription-events-v2 [01] |-------> | Lambda: mobile-purchases-export-subscription-events-table-PROD [05] | --------| S3 |----------> | datalake.mobile_subscription_events [11] |
 -------------------------------------------           ---------------------------------------------------------------------                             ------------------------------------------

 ----------------------------------                    -----------------------------------------------------------------                                 ------------------------------------
| Dynamo Table: subscriptions [02] | ---------------> | Lambda: mobile-purchases-export-subscription-table-v2-PROD [06] | ------------| S3 |----------> | datalake.mobile_subscriptions [12] |
 ----------------------------------                    -----------------------------------------------------------------                                 ------------------------------------

 ---------------------------------------               ----------------------------------------------------------------------                            -----------------------------------------
| Dynamo Table: user-subscriptions [08] | ----------> | Lambda: mobile-purchases-export-user-subscription-table-v2-PROD [07] | -------| S3 |----------> | datalake.mobile_user_subscriptions [13] |
 ---------------------------------------               ----------------------------------------------------------------------                            -----------------------------------------

Dynamo tables:
    [01] mobile-purchases-PROD-subscription-events-v2
    [02] mobile-purchases-PROD-subscriptions
    [08] mobile-purchases-PROD-user-subscriptions

Lambda/function (s):
    [03] mobile-purchases-export-google-historical-data-PROD                       -> [09]
          riff-raff label      : mobile-purchases-export-historical-data
          esbuild config entry : export-historical-data
          code path            : ./src/lambdas/exportHistoricalData.ts

    [04] mobile-purchases-export-apple-historical-data-PROD                        -> [10]
          riff-raff label      : mobile-purchases-export-historical-data
          esbuild config entry : export-historical-data
          code path            : ./src/lambdas/exportHistoricalData.ts

    [05] mobile-purchases-export-subscription-events-table-PROD                    -> [11]
          riff-raff label      : mobile-purchases-export-subscription-events-table
          esbuild config entry : export-subscription-events-table
          code path            : /src/lambdas/exportSubscriptionEventsTable.ts

    [06] mobile-purchases-export-subscription-table-v2-PROD                        -> [12]
          riff-raff label      : mobile-purchases-export-subscription-table-v2
          esbuild config entry : export-subscription-table-v2
          code path            : ./src/lambdas/exportSubscriptionTableV2.ts

    [07] mobile-purchases-export-user-subscription-table-v2-PROD                   -> [13]
          riff-raff label      : mobile-purchases-export-subscription-table-v2
          esbuild config entry : export-subscription-table-v2
          code path            : ./src/lambdas/exportSubscriptionTableV2.ts


All paths in the Ophan account:
    [09] datalake.mobile_subscription_historical_google
    [10] datalake.mobile_subscription_historical_apple
    [11] datalake.mobile_subscription_events
    [12] datalake.mobile_subscriptions
    [13] datalake.mobile_user_subscriptions

The CI file maps labels to program files.
The riffraff.yaml maps those labels to one or more function names.
```
