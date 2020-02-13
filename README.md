# Mobile Purchases
_IOS receipt validation and purchase persistence_

## Patterns
* static state enables reuse of resources between invocations
* A Controller bridges HTTP abstraction (LambdaRequest/LambdaResponse) from functionality
* A Route is high level routing logic (like message routing)
 
## Common
* commonlambda is generic functionality that may be useful to other projects
* userpurchasepersistence is a shared implementation of persistence functionality for the Dynamo table
 
## Lambda: iosvalidatereceipts (/validateReceipts)
### Routing (see ValidateReceiptsRouteImpl)
* send all receipts to App store and recursively fetch all receipts (latest, current, ..., everything), caching requests to avoid repetition
* transform all app store responses into representations of whether they are valid receipts
* attempt persistence (see Persistence)
* return validated transactions matching the requests

### Persistance(see TransactionPersistenceImpl)
* transform into the purchase representation
* only worry about the vendor id
* enrich with any known existing purchases (device sends batches of 25, so latest may not be in there)
* persist all valid purchases older than a month ago (may include future purchases)
* ttl is 6 months

## Lambda: iosuserpurchases (/userPurchases)
* read last persisted purchases (see /iosvalidatereceipts)

## Dynamo: Stores purchases
* key is userid:appid
* value is a string of json that includes purchases `{"purchases":[{...}, {...]}` that are directly returned by iosuserpurchases

## Notable Implementation Details:
* Typseafe Config instrumented from ssm
* OkHttpClient for async http
* Parallism.largeGlobalExecutionContext used as default ExecutionContext.Global is too small in Lambda
* Jackson with ScalaObjectMapper should be fast for JSON
* LambdaRequest/LambdaResponse - slightly neater bridge to the JSON API Gateway demands
* Delegation abstraction to allow for safe transition to new service
* Specs2 testing
* Mockito mocks third party code
* ScalaCheck for some property based testing
* Hack: AWS Lambda with log4j2 in Scala required sbt-assembly merge  ```case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy``` 

## Running typescript lambdas locally

We're using [Typescript](https://www.typescriptlang.org/) to develop new lambdas and its useful to be able to test these locally, without having to resubmit a build and deploy to the cloud. A problem with this, though, is that it can lead to inappropriate things ( like purchaseTokens ) being pushed to github. 

As a safeguard against this a test-launcher is provided to run a lambda locally, reading a file locally from outside version control in `typescript/src/test-launcher/test-launcher.ts`.

This can be run locally, and assumes a module with a function `handler` which takes some kind of a payload as a parameter. 

Test a lambda locally by creating a payload json file under `mobile-purchases-payload` and invoke the test-launcher with the name of your lamda module relative to the test-launcher along with the name of a payoad file. 

For example, to test the lambda that updates google subscriptions (`typescript/updatesubs/google.ts`). This reads from an SQS queue, so create a a file `sqs.json` like this and put it in `mobile-purchases-payload`*


```
{
  "Records": [
    {
      "messageId": "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
      "receiptHandle": "MessageReceiptHandle",
      "body": "{\"packageName\":\"not-saying\",\"purchaseToken\":\"idontwanttopushthistogithub",\"subscriptionId\":\"keeo-under-wraps\"}",
      "attributes": {
        "ApproximateReceiveCount": "1",
        "SentTimestamp": "1523232000000",
        "SenderId": "123456789012",
        "ApproximateFirstReceiveTimestamp": "1523232000001"
      },
      "messageAttributes": {},
      "md5OfBody": "7b270e59b47ff90a553787216d55d91d",
      "eventSource": "aws:sqs",
      "eventSourceARN": "arn:aws:sqs:eu-west-1:123456789012:MyQueue",
      "awsRegion": "eu-west-1"
    }
  ]
}
```

* This directory has it's own `.gitignore` which means that any json files here remain local.

Invoke your function locally via the launcher script thus

     tsc && node ./tsc-target/src/test-launcher/test-launcher.js ../playsubstatus/playsubstatus http.json

``
