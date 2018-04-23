package com.gu.mobilepurchases.persistence

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.mobilepurchases.validate.ValidateRequest
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.Try

trait TransactionPersistence {
  def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[_]

  def transformValidateRequest(validateReceiptRequest: ValidateRequest): UserIdWithAppId
}

case class UserIdWithAppId(userId: String, appId: String)

class TransactionPersistenceImpl(userPurchasePersistence: UserPurchasePersistence) extends TransactionPersistence {
  def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[_] = {
    userPurchasePersistence.write(UserPurchasesByUserIdAndAppId(userIdWithAppId.userId, userIdWithAppId.appId,
      transactions.map((transaction: ValidatedTransaction) => transformFromTransaction(transaction))))
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
