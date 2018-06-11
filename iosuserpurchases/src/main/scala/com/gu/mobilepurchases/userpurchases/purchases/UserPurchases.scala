package com.gu.mobilepurchases.userpurchases.purchases

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.gu.mobilepurchases.shared.cloudwatch.CloudWatchMetrics
import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.{ Failure, Success }

case class UserPurchasesRequest(appId: String, userIds: Set[String])

case class UserPurchasesResponse(purchases: Set[UserPurchase])

trait UserPurchases {
  def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse
}

class UserPurchasesImpl(
    cloudWatchMetrics: CloudWatchMetrics,
    userPurchasePersistence: UserPurchasePersistence,
    logger: Logger = LogManager.getLogger(classOf[UserPurchasesImpl])) extends UserPurchases {
  val emptyPurchases: Set[UserPurchase] = Set()
  override def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse = {
    UserPurchasesResponse(userPurchasesRequest.userIds
      .map(userPurchasePersistence.read(_: String, userPurchasesRequest.appId))
      .flatMap {
        case Success(userPurchasesByUserIdAndAppId) => countAndExtractPurchaseSet(userPurchasesByUserIdAndAppId)
        case Failure(t) => {
          logger.warn("Unexpected error from dynamo", t)
          throw t
        }
      })

  }

  private def countAndExtractPurchaseSet(userPurchasesByUserIdAndAppId: Option[UserPurchasesByUserIdAndAppId]): Set[UserPurchase] = {
    val purchases: Set[UserPurchase] = userPurchasesByUserIdAndAppId.map((_: UserPurchasesByUserIdAndAppId).purchases).getOrElse(emptyPurchases)
    cloudWatchMetrics.queueMetric("purchases-quantity", purchases.size, StandardUnit.Count)
    purchases
  }
}