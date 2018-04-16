package com.gu.mobilepurchases.lambda

import com.gu.AwsIdentity
import com.gu.mobilepurchases.apple.{AppStoreConfig, AppStoreImpl}
import com.gu.mobilepurchases.persistence.TransactionPersistenceImpl
import com.gu.mobilepurchases.shared.config.SsmConfig
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.persistence.{ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl}
import com.gu.mobilepurchases.validate._


object ValidateReceiptLambda {
  lazy val ssmConfig: SsmConfig = new SsmConfig()

  lazy val validateReceipts: ValidateReceiptsControllerImpl = Logging.logOnThrown(() => ssmConfig.identity match {
    case awsIdentity: AwsIdentity => new ValidateReceiptsControllerImpl(
      new ValidateReceiptsRouteImpl(
        new ValidateReceiptsTransformAppStoreResponseImpl(),
        new FetchAppStoreResponsesImpl(
          new AppStoreImpl(AppStoreConfig(ssmConfig.config, awsIdentity.stage))),
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

class ValidateReceiptLambda extends AwsLambda(ValidateReceiptLambda.validateReceipts)