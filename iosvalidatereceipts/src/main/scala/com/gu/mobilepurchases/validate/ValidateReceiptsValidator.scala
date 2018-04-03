package com.gu.mobilepurchases.validate

import java.time.Instant.ofEpochMilli
import java.time.ZoneOffset.UTC
import java.time.format.{DateTimeFormatter, DateTimeFormatterBuilder}

import com.gu.mobilepurchases.apple._
import com.gu.mobilepurchases.validate.ValidateReceiptsValidatorImpl.instantFormatter


trait ValidateReceiptsValidator {
  def validate(transaction: ValidateRequestTransaction): ValidatedTransaction
}

object ValidateReceiptsValidatorImpl {
  val instantFormatter:DateTimeFormatter = new DateTimeFormatterBuilder().parseCaseInsensitive().appendInstant(3).toFormatter()
}

class ValidateReceiptsValidatorImpl(appStore: AppStore) extends ValidateReceiptsValidator {
  def validate(transaction: ValidateRequestTransaction): ValidatedTransaction = {
    def validate(receiptData: String): ValidatedTransaction = {
      val appStoreResponse = appStore.send(receiptData)
      val validatedTransactionPurchase = appStoreResponse.mostRecentReceipt.map(receipt => {
        ValidatedTransactionPurchase(
          receipt.product_id,
          receipt.web_order_line_item_id,
          ValidatedTransactionPurchaseActiveInterval(
            ofEpochMilli(receipt.purchase_date_ms.toLong).atZone(UTC).format(instantFormatter),
            ofEpochMilli(receipt.expires_date.toLong).atZone(UTC).format(instantFormatter)))
      })
        .get
      val statusAsLong = appStoreResponse.status.toLong
      appStoreResponse.status.toInt match {
        case 0 | AutoRenewableSubsStatusCodes.ReceiptValidButSubscriptionExpired => ValidatedTransaction(
          transaction.id,
          validated = true,
          finishTransaction = true,
          validatedTransactionPurchase, statusAsLong)
        case AutoRenewableSubsStatusCodes.CouldNotReadJson |
             AutoRenewableSubsStatusCodes.MalformedReceiptData |
             AutoRenewableSubsStatusCodes.CouldNotAuthenticateReceipt => ValidatedTransaction(
          transaction.id,
          validated = false,
          finishTransaction = false,
          validatedTransactionPurchase,
          statusAsLong)
        case _ => ValidatedTransaction(transaction.id, validated = false, finishTransaction = true, validatedTransactionPurchase, statusAsLong)
      }
    }

    validate(transaction.receipt)
  }
}
