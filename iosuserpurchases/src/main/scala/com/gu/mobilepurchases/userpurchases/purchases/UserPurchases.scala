package com.gu.mobilepurchases.userpurchases.purchases

import java.time.ZonedDateTime.parse
import java.time.{Clock, ZonedDateTime}

import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.mobilepurchases.userpurchases.persistence.{UserPurchasePersistence, UserPurchasesByUserIdAndAppId}
import org.apache.logging.log4j.{LogManager, Logger}

import scala.util.Success

case class UserPurchasesRequest(appId: String, userIds: Set[String])

case class UserPurchasesResponse(purchases: Set[UserPurchase])

trait UserPurchases {
  def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse
}

object UserPurchasesImpl {
  val logger:Logger = LogManager.getLogger(classOf[UserPurchasesImpl])
}

class UserPurchasesImpl(userPurchasePersistence: UserPurchasePersistence, clock: Clock = Clock.systemUTC()) extends UserPurchases {
  override def findPurchases(userPurchasesRequest: UserPurchasesRequest): UserPurchasesResponse = {
    val zonedDateTime:ZonedDateTime = ZonedDateTime.now(clock)
    val purchasesForAppId: Set[UserPurchase] = userPurchasesRequest.userIds.map(userPurchasePersistence.read(_: String, userPurchasesRequest.appId)).map {
      case Success(option) => option
      case _ => None
    }.map((_: Option[UserPurchasesByUserIdAndAppId]).map((_: UserPurchasesByUserIdAndAppId).purchases.filter((purchase: UserPurchase) =>
      parse(purchase.activeInterval.end).isAfter(zonedDateTime)
    )).getOrElse(Set[UserPurchase]())).flatten
    UserPurchasesResponse(purchasesForAppId)

  }
}