# Mobile Purchases to Supporter Product Data Pipeline
The SupporterProductData DynamoDB table in the Membership AWS account is what is used by the user-benefits API to determine which products a user has access to.
In order for us to be able to include mobile subscriptions in this table we need to propagate changes from the mobile-purchases stack to the SupporterProductData table.

## High level architecture
The diagram below shows the high level architecture of the pipeline.

![Mobile Purchases to Supporter Product Data - Architecture.jpg](Mobile%20Purchases%20to%20Supporter%20Product%20Data%20-%20Architecture.jpg)