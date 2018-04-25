package com.gu.mobilepurchases.persistence
import java.time.{ Clock, ZonedDateTime }

import com.gu.mobilepurchases.userpurchases.UserPurchase

trait UserPurchaseFilterExpired {
  def filterExpired(purchases: Set[UserPurchase]): Set[UserPurchase]
}

class UserPurchaseFilterExpiredImpl(clock: Clock = Clock.systemUTC()) extends UserPurchaseFilterExpired {
  def filterExpired(purchases: Set[UserPurchase]): Set[UserPurchase] = {
    val aMonthAgo: ZonedDateTime = ZonedDateTime.now(clock).minusMonths(1)
    val transactions: Set[UserPurchase] = purchases.filter((purchase: UserPurchase) => {
      ZonedDateTime.parse(purchase.activeInterval.end).isAfter(aMonthAgo)
    })
    transactions
  }

}