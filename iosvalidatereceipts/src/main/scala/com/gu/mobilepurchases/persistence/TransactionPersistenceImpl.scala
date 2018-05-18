package com.gu.mobilepurchases.persistence

import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase }
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.mobilepurchases.validate.ValidateRequest

import scala.util.Try

trait TransactionPersistence {
  def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[Any]

  def transformValidateRequest(validateReceiptRequest: ValidateRequest): Set[UserIdWithAppId]
}

case class UserIdWithAppId(userId: String, appId: String)

class TransactionPersistenceImpl(
    userPurchasePersistence: UserPurchasePersistence,
    userPurchaseFilterExpired: UserPurchaseFilterExpired
) extends TransactionPersistence {

  def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[Any] = {
    val userId: String = userIdWithAppId.userId
    val appId: String = userIdWithAppId.appId
    val appStorePurchases: Set[UserPurchase] = transactions.flatMap(_.purchase.map(transformFromTransaction))
    for {
      existingMaybeUserPurchasesByUserIdAndAppId: Option[UserPurchasesByUserIdAndAppId] <- userPurchasePersistence.read(userId, appId)

      allPurchases = existingMaybeUserPurchasesByUserIdAndAppId
        .map((_: UserPurchasesByUserIdAndAppId).purchases ++ appStorePurchases)
        .getOrElse(appStorePurchases)

      filteredPurchases = userPurchaseFilterExpired.filterExpired(allPurchases)

      written: Option[UserPurchasesByUserIdAndAppId] <- userPurchasePersistence.write(UserPurchasesByUserIdAndAppId(userId, appId, filteredPurchases))
    } yield written

  }

  def transformFromTransaction(transaction: ValidatedTransactionPurchase): UserPurchase = {
    UserPurchase(
      transaction.productId,
      transaction.webOrderLineItemId,
      UserPurchaseInterval(transaction.activeInterval.start, transaction.activeInterval.end))
  }

  def transformValidateRequest(validateReceiptRequest: ValidateRequest): Set[UserIdWithAppId] = {
    val appId: String = validateReceiptRequest.appInfo.id
    validateReceiptRequest.userIds.map { case (k, v) => s"$k~$v" }.map(UserIdWithAppId(_, validateReceiptRequest.appInfo.id)).toSet
  }
}
