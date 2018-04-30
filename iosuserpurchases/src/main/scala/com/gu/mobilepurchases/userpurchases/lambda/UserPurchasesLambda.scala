package com.gu.mobilepurchases.userpurchases.lambda

import java.time.Clock

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchAsync, AmazonCloudWatchAsyncClientBuilder, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl, CloudWatchMetrics }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl, UserPurchasePersistenceTransformer }
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesImpl

object UserPurchasesLambda {
  val userPurchasesName: String = "iosuserpurchases"

  def userPurchasesController(ssmConfig: SsmConfig, clock: Clock, cloudWatch: CloudWatchMetrics): UserPurchasesController = Logging.logOnThrown(() =>
    new UserPurchasesController(new UserPurchasesImpl(new UserPurchasePersistenceImpl(
      ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(
        UserPurchaseConfig(
          ssmConfig.app,
          ssmConfig.stage,
          ssmConfig.stack)), new UserPurchasePersistenceTransformer(clock), cloudWatch))), "Error instantiating UserPurchasesLambda", Some(classOf[UserPurchasesLambda]))

}

class UserPurchasesLambda(ssmConfig: SsmConfig, cloudWatch: CloudWatch, clock: Clock) extends AwsLambda(UserPurchasesLambda.userPurchasesController(ssmConfig, clock, cloudWatch), cloudWatch = cloudWatch) {
  def this(ssmConfig: SsmConfig, amazonCloudWatch: AmazonCloudWatchAsync, clock: Clock) = this(ssmConfig, new CloudWatchImpl(ssmConfig.stage, UserPurchasesLambda.userPurchasesName, amazonCloudWatch), clock)
  def this() = this(SsmConfigLoader(), AmazonCloudWatchAsyncClientBuilder.defaultClient(), Clock.systemUTC())

}

