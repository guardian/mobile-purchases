package com.gu.mobilepurchases.userpurchases

import java.time.format.{ DateTimeFormatter, DateTimeFormatterBuilder }

case class UserPurchaseInterval(start: String, end: String)

case class UserPurchase(productId: String, webOrderLineItemId: String, activeInterval: UserPurchaseInterval)

object UserPurchase {
  val instantFormatter: DateTimeFormatter = new DateTimeFormatterBuilder().parseCaseInsensitive().appendInstant(3).toFormatter()
}