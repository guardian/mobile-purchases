package com.gu.mobilepurchases.userpurchases.purchases

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
    userPurchasePersistence: UserPurchasePersistence,
    logger: Logger = LogManager.getLogger(classOf[UserPurchasesImpl])) extends UserPurchases {

  override def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse = {
    UserPurchasesResponse(userPurchasesRequest.userIds
      .filter((_: String).startsWith("vendorUdid~"))
      .map(userPurchasePersistence.read(_: String, userPurchasesRequest.appId))
      .flatMap {
        case Success(userPurchasesByUserIdAndAppId) => userPurchasesByUserIdAndAppId.map((_: UserPurchasesByUserIdAndAppId).purchases).getOrElse(Set())
        case Failure(t) => {
          logger.warn("Unexpected error from dynamo", t)
          None
        }
      })

  }
}