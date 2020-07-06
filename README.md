# Mobile Purchases
_IOS receipt validation and purchase persistence_

## Structure of the project
 - The scala part of the project is considered "legacy". It's only kept for very old iOS devices and should be decommissioned once there's only a tiny amount of [traffic reaching the service](https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#dashboards:name=MobilePurchases;start=P7D).
 - The Typescript part of the project contains the more modern approach to validating and storing mobile purchases.

## Running typescript lambdas locally

We're using [Typescript](https://www.typescriptlang.org/) to develop this project and it's useful to be able to test these locally, without having to resubmit a build and deploy to the cloud. 

To avoid committing test data locally a test-launcher is provided to run a lambda locally, that will only read file in a directory configured to not commit anything.

This can be run locally, and assumes a module with a function `handler` which takes some kind of a payload as a parameter. 

Test a lambda locally by creating a payload json file under the `mobile-purchases-payload` directory and invoke the test-launcher with the name of your lambda module relative to the test-launcher along with the name of a payload file. 

For example, to test the lambda that updates google subscriptions (`typescript/update-subs/google.ts`). This reads from an SQS queue, so create a a file `sqs.json` like this and put it in `mobile-purchases-payload`.


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

_This directory has it's own `.gitignore` which means that any json files here remain local._

Invoke your function locally via the launcher script thus

```
tsc && node ./tsc-target/src/test-launcher/test-launcher.js ../update-subs/google.js sqs.json
```