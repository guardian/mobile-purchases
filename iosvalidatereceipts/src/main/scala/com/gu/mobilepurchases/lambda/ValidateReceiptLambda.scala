package com.gu.mobilepurchases.lambda

import com.gu.AwsIdentity
import com.gu.mobilepurchases.apple.{ AppStoreConfig, AppStoreImpl }
import com.gu.mobilepurchases.persistence.TransactionPersistenceImpl
import com.gu.mobilepurchases.shared.config.SsmConfig
import com.gu.mobilepurchases.shared.external.{ GlobalOkHttpClient, Logging }
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl }
import com.gu.mobilepurchases.validate._
import okhttp3.OkHttpClient

object ValidateReceiptLambda {

  def validateReceipts(ssmConfig: SsmConfig, client: OkHttpClient): ValidateReceiptsController = Logging.logOnThrown(
    () => ssmConfig.identity match {
      case awsIdentity: AwsIdentity => new ValidateReceiptsController(
        new ValidateReceiptsRouteImpl(
          new ValidateReceiptsTransformAppStoreResponseImpl(),
          new FetchAppStoreResponsesImpl(
            new AppStoreImpl(AppStoreConfig(ssmConfig.config, awsIdentity.stage), client)),
          new ValidateReceiptsFilterExpiredImpl(),
          new TransactionPersistenceImpl(new UserPurchasePersistenceImpl(
            ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(UserPurchaseConfig(awsIdentity.app, awsIdentity.stage, awsIdentity.stack))

          )))
      )
      case _ => throw new IllegalStateException("Missing aws Identity")
    },
    "Error initialising validate receipts controller",
    Some(classOf[ValidateReceiptLambda]))
}

class ValidateReceiptLambda(ssmConfig: SsmConfig, client: OkHttpClient) extends AwsLambda(ValidateReceiptLambda.validateReceipts(ssmConfig, client)) {
  def this() = this(new SsmConfig, GlobalOkHttpClient.defaultHttpClient)
}