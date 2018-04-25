# Mobile Purchases
_IOS receipt validation and purchase persistence_
 
## Lambda: iosvalidatereceipts (/validateReceipts)
### Routing (see ValidateReceiptsRouteImpl)
* send all receipts to App store and recursively fetch all receipts (latest, current, ..., everything), caching requests to avoid repetition
* transform all app store responses into representations of whether they are valid receipts
* attempt persistence (see Persistence)
* return all valid receipts

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
* value is a string of json that includes purchases `{"purchases":[{...}, {...]}`

## Notable Implementation Details:
* Typseafe Config instrumented from ssm (in progress)
* OkHttpClient
* Custom Execution Context (Global is too small in Lambda)
* Json (Jackson)
* AWS Lambda abstraction - candidate for reuse (com.gu.mobilepurchases.lambda.LambdaApiGateway)
* Delegation abstraction to allow for safe transition to new service
* Specs2 testing
* Hack: AWS Lambda with log4j2 in Scala required sbt-assembly merge  ```case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy``` 

