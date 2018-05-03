package com.gu.mobilepurchases.model

case class ValidatedTransactionPurchaseActiveInterval(start: String, end: String)

case class ValidatedTransactionPurchase(
    productId: String,
    webOrderLineItemId: String,
    activeInterval: ValidatedTransactionPurchaseActiveInterval
)

object ValidatedTransaction {

  def apply(
    transactionId: String,
    validated: Boolean,
    finishTransaction: Boolean,
    purchase: ValidatedTransactionPurchase,
    appStoreStatusResponse: Long
  ): ValidatedTransaction = {
    val validatedLong: Int = if (validated) 1 else 0
    val finishTransactionLong: Int = if (finishTransaction) 1 else 0
    ValidatedTransaction(transactionId, validatedLong, finishTransactionLong, purchase, appStoreStatusResponse)
  }
}

case class ValidatedTransaction(
    transactionId: String,
    validated: Long,
    finishTransaction: Long,
    purchase: ValidatedTransactionPurchase,
    appStoreStatusResponse: Long
)
