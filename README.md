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

