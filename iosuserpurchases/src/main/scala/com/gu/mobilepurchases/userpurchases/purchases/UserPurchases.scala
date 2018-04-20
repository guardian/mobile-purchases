package com.gu.mobilepurchases.userpurchases.purchases

import java.time.ZonedDateTime.parse
import java.time.{ Clock, ZonedDateTime }

import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.{ Failure, Success }

case class UserPurchasesRequest(appId: String, userIds: Set[String])

case class UserPurchasesResponse(purchases: Set[UserPurchase])

trait UserPurchases {
  def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse
}

object UserPurchasesImpl {
  val logger: Logger = LogManager.getLogger(classOf[UserPurchasesImpl])
}

class UserPurchasesImpl(userPurchasePersistence: UserPurchasePersistence, clock: Clock = Clock.systemUTC()) extends UserPurchases {
  override def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse = {
    val zonedDateTime: ZonedDateTime = ZonedDateTime.now(clock)
    UserPurchasesResponse(userPurchasesRequest.userIds
      .map(userPurchasePersistence.read(_: String, userPurchasesRequest.appId))
      .flatMap {
        case Success(userPurchasesByUserIdAndAppId) => userPurchasesByUserIdAndAppId.map(_.purchases.filter((purchase: UserPurchase) =>
          parse(purchase.activeInterval.end).isAfter(zonedDateTime)
        )).getOrElse(Set())
        case Failure(t) => {
          UserPurchasesImpl.logger.warn("Unexpected error from dynamo", t)
          None
        }
      })

    //
    //    val purchasesForAppId: Set[UserPurchase] = userPurchasesRequest.userIds
    //      .map(userPurchasePersistence.read(_: String, userPurchasesRequest.appId))
    //      .map {
    //        case Success(option) => option
    //        case Failure(t) => {
    //          UserPurchasesImpl.logger.warn("Unexpected error from dynamo", t)
    //          None
    //        }
    //      }.flatMap((_: Option[UserPurchasesByUserIdAndAppId]).map((_: UserPurchasesByUserIdAndAppId).purchases.filter((purchase: UserPurchase) =>
    //      parse(purchase.activeInterval.end).isAfter(zonedDateTime)
    //    )).getOrElse(Set[UserPurchase]()))
    //    UserPurchasesResponse(purchasesForAppId)

  }
}