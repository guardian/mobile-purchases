package com.gu.mobilepurchases.userpurchases.lambda

import java.time.Clock

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.CloudWatchImpl
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl, UserPurchasePersistenceTransformer }
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesImpl

object UserPurchasesLambda {
  val userPurchasesName: String = "iosuserpurchases"

  def userPurchasesController(ssmConfig: SsmConfig, clock: Clock): UserPurchasesController = Logging.logOnThrown(() =>
    new UserPurchasesController(new UserPurchasesImpl(new UserPurchasePersistenceImpl(
      ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(
        UserPurchaseConfig(
          ssmConfig.app,
          ssmConfig.stage,
          ssmConfig.stack)), new UserPurchasePersistenceTransformer(clock)))), "Error instantiating UserPurchasesLambda", Some(classOf[UserPurchasesLambda]))

}

class UserPurchasesLambda(ssmConfig: SsmConfig, amazonCloudWatch: AmazonCloudWatch, clock: Clock) extends AwsLambda(UserPurchasesLambda.userPurchasesController(ssmConfig, clock), cloudWatch = new CloudWatchImpl(ssmConfig.stage, UserPurchasesLambda.userPurchasesName, amazonCloudWatch)) {
  def this() = this(SsmConfigLoader(), AmazonCloudWatchClientBuilder.defaultClient(), Clock.systemUTC())
}

