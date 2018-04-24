package com.gu.mobilepurchases.lambda

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.apple.{ AppStoreConfig, AppStoreImpl }
import com.gu.mobilepurchases.persistence.TransactionPersistenceImpl
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl, CloudWatchMetrics }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.{ GlobalOkHttpClient, Logging }
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl }
import com.gu.mobilepurchases.validate._
import okhttp3.OkHttpClient

object ValidateReceiptLambda {
  val validateReceiptsName: String = "iosvalidatereceipts"
  def validateReceipts(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatchMetrics): ValidateReceiptsController = Logging.logOnThrown(
    () => new ValidateReceiptsController(
      new ValidateReceiptsRouteImpl(
        new ValidateReceiptsTransformAppStoreResponseImpl(),
        new FetchAppStoreResponsesImpl(
          new AppStoreImpl(AppStoreConfig(ssmConfig.config, ssmConfig.stage), client, cloudWatch), cloudWatch),
        new ValidateReceiptsFilterExpiredImpl(),
        new TransactionPersistenceImpl(new UserPurchasePersistenceImpl(
          ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(UserPurchaseConfig(ssmConfig.app, ssmConfig.stage, ssmConfig.stack))

        ))
      )),
    "Error initialising validate receipts controller",
    Some(classOf[ValidateReceiptLambda]))
}

class ValidateReceiptLambda(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatch) extends AwsLambda(
  ValidateReceiptLambda.validateReceipts(ssmConfig, client, cloudWatch), cloudWatch =
    cloudWatch) {
  def this(ssmConfig: SsmConfig, client: OkHttpClient, amazonCloudWatch: AmazonCloudWatch) =

    this(ssmConfig, client, new CloudWatchImpl(ssmConfig.stage, ValidateReceiptLambda.validateReceiptsName, amazonCloudWatch))

  def this() = this(SsmConfigLoader(), GlobalOkHttpClient.defaultHttpClient, AmazonCloudWatchClientBuilder.defaultClient())
}