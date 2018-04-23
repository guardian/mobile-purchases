package com.gu.mobilepurchases.userpurchases.lambda

import com.gu.AwsIdentity
import com.gu.mobilepurchases.shared.cloudwatch.CloudWatchImpl
import com.gu.mobilepurchases.shared.config.SsmConfig
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl }
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesImpl

object UserPurchasesLambda {

  def userPurchasesController(ssmConfig: SsmConfig): UserPurchasesController = Logging.logOnThrown(() => ssmConfig.identity match {
    case awsIdentity: AwsIdentity => new UserPurchasesController(new UserPurchasesImpl(new UserPurchasePersistenceImpl(
      ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(
        UserPurchaseConfig(
          awsIdentity.app,
          awsIdentity.stage,
          awsIdentity.stack)))))
    case _ => throw new IllegalStateException("Missing aws Identity")
  }, "Error instantiating UserPurchasesLambda", Some(classOf[UserPurchasesLambda]))

}

class UserPurchasesLambda(ssmConfig: SsmConfig) extends AwsLambda(UserPurchasesLambda.userPurchasesController(ssmConfig), cloudWatch = new CloudWatchImpl(ssmConfig.stage)) {
  def this() = this(new SsmConfig)
}

