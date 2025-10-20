
# The Feast Acquisition Pipeline

[The Guardian Feast app (recipes)](https://www.theguardian.com/help/insideguardian/2024/apr/17/introducing-the-feast-app), can be accessed using a user's Guardian account (this can be an existing account or an account created on the fly when login to the app for the first time), and then allows users to take a Feast subscription, directly from the app.

By a process that is not documented here, those subscriptions end up in the { User Subscription } dynamo table

The feast acquisition pileline is a workflow we implented in 2024, that take subscriptions notifications from the User Subscriptions Dynamo table and relays them to Big Query through the Acquisition API which is itself a Event Bridge to BQ.

This page documents the various stages of this workflow, for future reference. Notably we document the Apple Subscription look up using JSON Web Tokens, which has no other occurence in all of mobile-purchases as well as the API call the the bq event handler which is also novel to this project.

## Architectural Diagram

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

## Diagram Elements

### From User Subscriptions to the Routing Lambda.

The User Subscriptions is the table `mobile-purchases-PROD-user-subscriptions` in the `mobile` account.

```
account : mobile
table   : mobile-purchases-PROD-user-subscriptions
```

When a record is modified inside this table (where "modified" includes being added), an event is put on the queue [todo], that triggers the routing lambda.


### Routing Lambda

```
account              : mobile
lambda function name : mobile-purchases-feast-acquisition-events-router-PROD
cf name              : FeastAcquisitionEventsRouterLambda
location             : typescript/src/feast/acquisition-events/google.ts
```

If the modification event is "insert", meaning that the event represents an item being inserted, and therefore a new subscription having been added to the table, then we read the subscription's id from the event and query the dynamo table to retrieve the record / subscription.

The subscription is then going to be introspected to determine if it was a Feast subscription or not, and if a Feast subscription, will be further introspected to determine the platform, iOS or Android, it originates from.

An event is dropped on the Apple SQS queue or Google SQS queue

### Apple SQS queue

```
account     : mobile
queue       : mobile-purchases-PROD-feast-apple-acquisition-events-queue
queue (dlq) : mobile-purchases-PROD-feast-apple-acquisition-events-dlq
cf name     : FeastAppleAcquisitionEventsQueue
```

### Google SQS queue

```
account     : mobile
queue       : mobile-purchases-PROD-feast-google-acquisition-events-queue
queue (dlq) : mobile-purchases-PROD-feast-google-acquisition-events-dlq
cf name     : FeastGoogleAcquisitionEventsQueue
```

### Apple Processing Lambda

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

### Google Processing Lambda

```
account              : mobile
lambda function name : mobile-purchases-feast-google-acquisition-events-PROD
cf name              : FeastGoogleAcquisitionEventsLambda
location             : typescript/src/feast/acquisition-events/router.ts
```

### Fact Acquisition API

The fact Aquisition API's end point is documented here: [acquisition-events-api](https://github.com/guardian/support-frontend/tree/main/support-lambdas/acquisition-events-api#acquisition-events-api). Unlike other urls, for instance the storekit url, the fact acquisition url is hidden in Parameter Store.

```
ssm parameters
/mobile-purchases/PROD/mobile/acquisitionApiUrl
/mobile-purchases/CODE/mobile/acquisitionApiUrl (not set up)
```

### The fact_acquisition_event table

Is located here:

```
https://cloud.google.com/bigquery/?hl=en
Big Query Studio
    datatech-platform-prod
        datalake
            fact_acquisition_event
```
