package com.gu.mobilepurchases.persistence

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.mobilepurchases.validate.ValidateRequest

import scala.util.Try

trait TransactionPersistence {
  def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[_]

  def transformValidateRequest(validateReceiptRequest: ValidateRequest): UserIdWithAppId
}

case class UserIdWithAppId(userId: String, appId: String)

class TransactionPersistenceImpl(
    userPurchasePersistence: UserPurchasePersistence,
    userPurchaseFilterExpired: UserPurchaseFilterExpired
) extends TransactionPersistence {

  def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[_] = {
    val userId: String = userIdWithAppId.userId
    val appId: String = userIdWithAppId.appId
    val appStorePurchases: Set[UserPurchase] = transactions.map((transaction: ValidatedTransaction) => transformFromTransaction(transaction))
    for {
      existingMaybeUserPurchasesByUserIdAndAppId: Option[UserPurchasesByUserIdAndAppId] <- userPurchasePersistence.read(userId, appId)

      allPurchases = existingMaybeUserPurchasesByUserIdAndAppId
        .map((_: UserPurchasesByUserIdAndAppId).purchases ++ appStorePurchases)
        .getOrElse(appStorePurchases)

      filteredPurchases = userPurchaseFilterExpired.filterExpired(allPurchases)

      written: Option[UserPurchasesByUserIdAndAppId] <- userPurchasePersistence.write(UserPurchasesByUserIdAndAppId(userId, appId, filteredPurchases))
    } yield written
  }

  def transformFromTransaction(transaction: ValidatedTransaction): UserPurchase = {
    UserPurchase(
      transaction.purchase.productId,
      transaction.purchase.webOrderLineItemId,
      UserPurchaseInterval(transaction.purchase.activeInterval.start, transaction.purchase.activeInterval.end))
  }

  def transformValidateRequest(validateReceiptRequest: ValidateRequest): UserIdWithAppId = {
    val appId: String = validateReceiptRequest.appInfo.id
    val vendorUdid: String = s"vendorUdid~${validateReceiptRequest.userIds.vendorUdid}"
    val userIdWithAppId: UserIdWithAppId = UserIdWithAppId(vendorUdid, appId)
    userIdWithAppId
  }
}
