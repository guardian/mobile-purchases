# Architecture

This service is a set of AWS lambdas, triggered by an API Gateway, SQS queues or Dynamo events. This allow us to scale very efficiently and very cheaply as well as getting retries for free when querying Apple and Google's services. 

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
 ------------------------      HTTP via API Gateway        ----------------                         ------------                                         -----------------------------                        -----------------------------
| App Store & Play Store | --------------------------->   | Pubsub Lambdas |      ---------------> | SQS Queues | --------------------------------------| Update subscription Lambdas | -------------------> | Dynamo Table: subscriptions |
 ------------------------                                  ----------------                         ------------                                         -----------------------------                        -----------------------------
                                                          ( applepubsub )                          ( apple-subscriptions-to-fetch )                     ( apple-subscriptions-to-fetch )
                                                          ( googlepubsub )                         ( google-subscriptions-to-fetch )                    ( google-subscriptions-to-fetch )
                                                          ( feastapplepubsub )                     ( feast-apple-subscriptions-to-fetch )               ( feast-apple-subscriptions-to-fetch )
                                                          ( feastgooglepubsub )                    ( feast-google-subscriptions-to-fetch )              ( feast-google-subscriptions-to-fetch )
                                                                |                                                                                               |
                                                                |                                                                                               |
                                                                |                                                                                               |                   ----------------------------------
                                                                |                                                                                                ----------------> | Dynamo table: user-subscriptions |
                                                                |                                                                                                  (feast only)     ----------------------------------
                                                                |                                                                                               |
                                                                |                                                                                               |
                                                                v                                                                                               |                   ------------
                                                 --------------------------------------                                                                          ----------------> | SQS Queues |
                                                | Dynamo Table: subscription-events-v2 |                                                                           (feast only)     ------------
                                                 --------------------------------------                                                                                            ( apple-historical-subscriptions )
                                                                                                                                                                                   ( google-historical-subscriptions )
                                                                                                         




```

This pattern is repeated for the Apple and Google live apps, as well as Feast apps.

In addition to writing to the subscriptions Dynamo table, the Feast lambdas also attempt to link to a user by reading a custom field from the receipt data which is exchanged with Braze for an Identity ID. This is then written to the user-subscriptions table. The live apps do not work this way and the user-subscriptions record is added by the link lambdas (see below).

**Note:** Apple subscriptions are revalidated on a schedule by the apple-revalidate-receipts lambda. This lambda reads from the subscriptions Dynamo table and pushes items to the subscriptions-to-fetch SQS queues.

**Note:** Tokens for the Play Store are refreshed on a schedule by the mobile-purchases-googleoauth lambda and accessed from an s3 bucket.

## Linking

The mobile apps link an In App Purchase with a Guardian user by calling the link endpoints. The user must be signed in for this to happen. For the live apps this is the only way users are linked to subscriptions. For Feast, this endpoint is _sometimes_ called as there are cases where the linking cannot happen using the receipt data (e.g. promo codes on iOS).


```

(Unless otherwise specified elements are in the mobile aws account)

                                    ------------                                -----------------------------
                                   | SQS Queues | ---------------------------> | Update subscription Lambdas |
                                    ------------                                -----------------------------
                                   ( apple-subscriptions-to-fetch )
                                   ( google-subscriptions-to-fetch )
                                         ^
                                         |
                                         |
                                         |
 ---------------                   --------------                               ----------------------------------
| Mobile Device | --------------> | Link Lambdas | --------------------------> | Dynamo table: user-subscriptions |
 ---------------                   --------------                               ----------------------------------
                                  (google-link-user-subscription)
                                  (apple-link-user-subscription)

```


In some cases the subscription is queued for processing by pushing to the subscriptions-to-fetch SQS queues.

## User & subscription related events

Inserts into the user-subscriptions Dynamo table trigger the soft-opt-in-acquisitions lambda which in turn pushes onto SQS queues in the membership account to set SOI consents and send emails.

Deletions from the subscriptions table (triggered by the TTL being reached) trigger the delete-user-subscription lambda. This severs the user-subscription record for this subscription and pushes onto a queue in the membership account to trigger a recalculation of SOI consents.

```

(Unless otherwise specified elements are in the mobile aws account)

 -----------------------------      DELETE event (trigerred by TTL)    ----------------------------------                        ---------------------------------------
| Dynamo table: subscriptions | ------------------------------------> | Lambda: delete-user-subscription |               -----> | SQS: soft-opt-in-consent-setter-queue |
 -----------------------------                                         ----------------------------------               |        ---------------------------------------
                                                                                      |                                 |         (membership account)
                                                                                      |                                 |
                                          DELETE                                      |                                 |
            --------------------------------------------------------------------------                                  |
           |                                                                                                            |
           v                                                                                                            |
 ----------------------------------          INSERT event                   ----------------------------------          |              -------------------
| Dynamo table: user-subscriptions | ------------------------------------> | Lambda: soft-opt-in-acquisitions | --------------------> | SQS: braze-emails |
 ----------------------------------                                         ----------------------------------                         -------------------
                                                                                                                                      (membership account)

```


## Subscription status endpoints

The apps call endpoints to check the status of a subscription.

```

(Unless otherwise specified elements are in the mobile aws account)

 ---------------                   ------------------------------------                         -------------------
| Mobile Device | --------------> | Lambda: google-subscription-status | --------------------> | Google Play Store |
 ---------------                   ------------------------------------                         -------------------

 ---------------                   ------------------------------------                         -----------------
| Mobile Device | --------------> | Lambda: apple-subscription-status  | --------------------> | Apple App Store |
 ---------------                   ------------------------------------                         -----------------

```


**Note:** Tokens for the Play Store are refreshed on a schedule by the mobile-purchases-googleoauth lambda and accessed from an s3 bucket.

## Datalake export

The subscriptions, subscription-events and user-subscriptions Dynamo tables are exported to the datalake. This is orchestrated by lambdas triggered on a cron schedule. Data is exported to s3 by the lambdas and then transferred to GCS and ingested into a table, scheduled by Airflow.

The update-subscriptions lambdas push onto an SQS queue for each change and this historical data is exported by lambdas.

```


(Unless otherwise specified elements are in the mobile aws account)

 --------------------------------------                  ---------------------------------------                ----                ------------------------------------------------
| SQS: google-historical-subscriptions | -------------> | Lambda: export-google-historical-data | -------------| S3 |------------> | datalake.mobile_subscription_historical_google |
 --------------------------------------                  ---------------------------------------                ----                ------------------------------------------------

 -------------------------------------                   --------------------------------------                 ----                -----------------------------------------------
| SQS: apple-historical-subscriptions | --------------> | Lambda: export-apple-historical-data | --------------| S3 |------------> | datalake.mobile_subscription_historical_apple |
 -------------------------------------                   --------------------------------------                 ----                -----------------------------------------------

 -----------------------------------                     ------------------------------------------             ----                -------------------------------------
| Dynamo Table: subscription-events | ----------------> | Lambda: export-subscription-events-table | ----------| S3 |------------> | datalake.mobile_subscription_events |
 -----------------------------------                     ------------------------------------------             ----                -------------------------------------

 -----------------------------                           --------------------------------------                 ----                -------------------------------
| Dynamo Table: subscriptions | ----------------------> | Lambda: export-subscription-table-v2 | --------------| S3 |------------> | datalake.mobile_subscriptions |
 -----------------------------                           --------------------------------------                 ----                -------------------------------

 ----------------------------------                      -------------------------------------------            ----                ------------------------------------
| Dynamo Table: user-subscriptions | -----------------> | Lambda: export-user-subscription-table-v2 | ---------| S3 |------------> | datalake.mobile_user_subscriptions |
 ----------------------------------                      -------------------------------------------            ----                ------------------------------------

```

