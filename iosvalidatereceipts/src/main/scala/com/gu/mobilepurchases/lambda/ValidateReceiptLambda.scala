package com.gu.mobilepurchases.lambda

import java.time.Clock
import java.util.concurrent.TimeUnit

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatchAsync, AmazonCloudWatchAsyncClientBuilder }
import com.gu.mobilepurchases.apple.{ AppStoreConfig, AppStoreImpl }
import com.gu.mobilepurchases.lambda.ValidateReceiptLambda.validateReceiptsName
import com.gu.mobilepurchases.persistence.{ TransactionPersistenceImpl, UserPurchaseFilterExpiredImpl }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl, CloudWatchMetrics }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.{ GlobalOkHttpClient, Logging }
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl, UserPurchasePersistenceTransformer }
import com.gu.mobilepurchases.validate._
import okhttp3.OkHttpClient

import scala.concurrent.duration.Duration

object ValidateReceiptLambda {
  val validateReceiptsName: String = "iosvalidatereceipts"

  def validateReceipts(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatchMetrics, clock: Clock, timeout: Duration): ValidateReceiptsController = Logging.logOnThrown(
    () => new ValidateReceiptsController(
      new ValidateReceiptsRouteImpl(
        new ValidateReceiptsTransformAppStoreResponseImpl(),
        new FetchAppStoreResponsesImpl(
          new AppStoreImpl(AppStoreConfig(ssmConfig.config, ssmConfig.stage), client, cloudWatch), cloudWatch, timeout),
        new TransactionPersistenceImpl(new UserPurchasePersistenceImpl(
          ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(UserPurchaseConfig(ssmConfig.app, ssmConfig.stage, ssmConfig.stack)),
          new UserPurchasePersistenceTransformer(clock), cloudWatch
        ), new UserPurchaseFilterExpiredImpl())
      )),
    "Error initialising validate receipts controller",
    Some(classOf[ValidateReceiptLambda]))
}

class ValidateReceiptLambda(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatch, clock: Clock, timeout: Duration) extends AwsLambda(
  ValidateReceiptLambda.validateReceipts(ssmConfig, client, cloudWatch, clock, timeout), cloudWatch =
    cloudWatch) {
  def this(ssmConfig: SsmConfig, client: OkHttpClient, amazonCloudWatch: AmazonCloudWatchAsync, clock: Clock, timeout: Duration) =

    this(ssmConfig, client, new CloudWatchImpl(ssmConfig.stage, validateReceiptsName, amazonCloudWatch), clock, timeout)

  def this() = this(SsmConfigLoader(validateReceiptsName), GlobalOkHttpClient.defaultHttpClient, AmazonCloudWatchAsyncClientBuilder.defaultClient(), Clock.systemUTC(), Duration(270, TimeUnit.SECONDS))
}