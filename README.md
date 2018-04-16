# Mobile Purchases
_IOS receipt validation and purchase verification_
 
## iosvalidatereceipts
/validateReceipts
* validate receipts
* persist into dynamo (todo)

Notable Implemtation Details:
* Typseafe Config instrumented from ssm (in progress)
* Apache http client
* Json (Jackson)
* AWS Lambda abstraction - candidate for reuse (com.gu.mobilepurchases.lambda.LambdaApiGateway)
* Specs2 testing
* Hack: AWS Lambda with log4j2 in Scala required sbt-assembly merge  ```case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy``` 

