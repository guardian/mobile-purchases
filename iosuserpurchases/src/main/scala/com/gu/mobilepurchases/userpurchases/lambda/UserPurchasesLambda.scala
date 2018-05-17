package com.gu.mobilepurchases.userpurchases.lambda

import java.time.Clock

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatchAsync, AmazonCloudWatchAsyncClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl, CloudWatchMetrics }
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.mobilepurchases.shared.lambda.AwsLambda
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.lambda.UserPurchasesLambda.userPurchasesName
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl, UserPurchaseConfig, UserPurchasePersistenceImpl, UserPurchasePersistenceTransformer }
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesImpl
import com.gu.{ AppIdentity, AwsIdentity }

object UserPurchasesLambda {
  val userPurchasesName: String = "iosuserpurchases"

  def fetchUserPurchaseConfig: UserPurchaseConfig = AppIdentity.whoAmI(defaultAppName = "mobile-purchases") match {
    case awsIdentity: AwsIdentity => UserPurchaseConfig(awsIdentity.app, awsIdentity.stage, awsIdentity.stack)
    case _                        => throw new IllegalStateException("Not in aws")
  }

  def userPurchasesController(userPurchaseConfig: UserPurchaseConfig, clock: Clock, cloudWatch: CloudWatchMetrics): UserPurchasesController = Logging.logOnThrown(() =>
    new UserPurchasesController(new UserPurchasesImpl(cloudWatch, new UserPurchasePersistenceImpl(
      ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(
        userPurchaseConfig), new UserPurchasePersistenceTransformer(), cloudWatch)), cloudWatch), "Error instantiating UserPurchasesLambda", Some(classOf[UserPurchasesLambda]))
}

class UserPurchasesLambda(userPurchaseConfig: UserPurchaseConfig, cloudWatch: CloudWatch, clock: Clock) extends AwsLambda(UserPurchasesLambda.userPurchasesController(userPurchaseConfig, clock, cloudWatch), cloudWatch = cloudWatch) {
  def this(userPurchaseConfig: UserPurchaseConfig, amazonCloudWatch: AmazonCloudWatchAsync, clock: Clock) = this(userPurchaseConfig, new CloudWatchImpl(userPurchaseConfig.stage, userPurchasesName, amazonCloudWatch), clock)

  def this() = this(UserPurchasesLambda.fetchUserPurchaseConfig, AmazonCloudWatchAsyncClientBuilder.defaultClient(), Clock.systemUTC())

}

