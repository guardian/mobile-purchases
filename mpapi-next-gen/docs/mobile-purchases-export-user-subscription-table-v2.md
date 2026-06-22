
mobile-purchases-export-user-subscription-table-v2 writes the two files

```
arn:aws:dynamodb:eu-west-1:${account}:table/mobile-purchases-PROD-subscriptions
arn:aws:dynamodb:eu-west-1:${account}:table/mobile-purchases-PROD-user-subscriptions
```

It uses the exportTableToPointInTime function which is an operation in AWS DynamoDB that exports your table data to an Amazon S3 bucket.
