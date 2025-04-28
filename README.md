# Mobile Purchases

The Mobile Purchases API System (MPAPI) is a collection of software functions that keep track of IAP purchases within the Live and Feast apps and surface information about these to other downstream systems.

## Structure of the project

- The scala part of the project is considered "legacy". It's only kept for very old iOS devices and should be decommissioned once there's only a tiny amount of [traffic reaching the service](https://eu-west-1.console.aws.amazon.com/cloudwatch/home?region=eu-west-1#dashboards:name=MobilePurchases;start=P7D).
- The Typescript part of the project contains the more modern approach to validating and storing mobile purchases.

## Local Development

### Node

Make sure that you are using the Node version specified by the `.nvmrc` file. We recommend [`fnm`](https://github.com/Schniz/fnm) as the Node version manager.

1. Install `yarn`: `npm install -g yarn`
2. Run `yarn` to install dependencies
3. Run local tests: `yarn test`

### Linting

eslint with prettier (including the guardian config) is now used to provide consistent formatting and linting. It is not yet mandatory, so doesn't yet exist as a pre-commit hook. To apply, run `yarn lint` or `yarn lint-fix`.

### Data

There are three Dynamo DB tables:

- **Events** (`mobile-purchases-<stage>-subscription-events-v2`): This table records events as they are received from Google and Apple.
- **Subscriptions** (`mobile-purchases-<stage>-subscriptions`): This table records subscriptions held by our users. It contains information such as start date, expiration date, type of subscription and whether it will automatically renew at the end of its validity.
- **UserSubscriptions** (`mobile-purchases-<stage>-user-subscriptions`): This table records the link between a User (as defined by the Guardian) and a subscription.

These tables are exported daily to the datalake.

### Documentation Portal

See [Documentation Portal](docs/README.md).

## Running TypeScript lambdas locally

We're using [TypeScript](https://www.typescriptlang.org/) to develop this project and it's useful to be able to test these locally, without having to resubmit a build and deploy to the cloud.

To avoid committing test data locally a test-launcher is provided to run a lambda locally, that will only read a file in a directory that's configured to not commit anything.

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

_This directory has its own `.gitignore` which means that any json files here remain local._

Invoke your function locally via the launcher script thus

```
yarn test-lambda update-subs/google sqs.json
```
