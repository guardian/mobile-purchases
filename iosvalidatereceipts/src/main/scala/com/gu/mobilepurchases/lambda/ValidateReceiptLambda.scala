package com.gu.mobilepurchases.lambda

import java.util.concurrent.TimeUnit

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.apple.{ AppStoreConfig, AppStoreImpl }
import com.gu.mobilepurchases.persistence.{ TransactionPersistenceImpl, UserPurchaseFilterExpiredImpl }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl, CloudWatchMetrics }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.{ GlobalOkHttpClient, Logging }
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl }
import com.gu.mobilepurchases.validate._
import okhttp3.OkHttpClient

import scala.concurrent.duration.Duration

object ValidateReceiptLambda {
  val validateReceiptsName: String = "iosvalidatereceipts"

  def validateReceipts(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatchMetrics, timeout: Duration): ValidateReceiptsController = Logging.logOnThrown(
    () => new ValidateReceiptsController(
      new ValidateReceiptsRouteImpl(
        new ValidateReceiptsTransformAppStoreResponseImpl(),
        new FetchAppStoreResponsesImpl(
          new AppStoreImpl(AppStoreConfig(ssmConfig.config, ssmConfig.stage), client, cloudWatch), cloudWatch, timeout),
        new TransactionPersistenceImpl(new UserPurchasePersistenceImpl(
          ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(UserPurchaseConfig(ssmConfig.app, ssmConfig.stage, ssmConfig.stack))
        ), new UserPurchaseFilterExpiredImpl())
      )),
    "Error initialising validate receipts controller",
    Some(classOf[ValidateReceiptLambda]))
}

class ValidateReceiptLambda(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatch, timeout: Duration) extends AwsLambda(
  ValidateReceiptLambda.validateReceipts(ssmConfig, client, cloudWatch, timeout), cloudWatch =
    cloudWatch) {
  def this(ssmConfig: SsmConfig, client: OkHttpClient, amazonCloudWatch: AmazonCloudWatch, timeout: Duration) =

    this(ssmConfig, client, new CloudWatchImpl(ssmConfig.stage, ValidateReceiptLambda.validateReceiptsName, amazonCloudWatch), timeout)

  def this() = this(SsmConfigLoader(), GlobalOkHttpClient.defaultHttpClient, AmazonCloudWatchClientBuilder.defaultClient(), Duration(270, TimeUnit.SECONDS))
}