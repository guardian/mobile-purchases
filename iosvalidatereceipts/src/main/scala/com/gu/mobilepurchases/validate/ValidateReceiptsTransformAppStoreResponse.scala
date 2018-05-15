package com.gu.mobilepurchases.validate

import java.time.Instant.ofEpochMilli
import java.time.ZoneOffset.UTC

import com.gu.mobilepurchases.apple._
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionPurchaseActiveInterval }
import com.gu.mobilepurchases.userpurchases.UserPurchase.instantFormatter

trait ValidateReceiptsTransformAppStoreResponse {
  def transformAppStoreResponse(appStoreResponse: AppStoreResponse): Set[ValidatedTransaction]
}

case class ValidatedTransactionAndMaybeLatestReceipt(validatedTransactions: ValidatedTransaction, maybeReceiptData: Option[String])

case class ValidReceiptsResponseWithAnyLaterReceipts(validatedTransactions: Set[ValidatedTransaction], latestReceipts: Set[String])

class ValidateReceiptsTransformAppStoreResponseImpl extends ValidateReceiptsTransformAppStoreResponse {
  override def transformAppStoreResponse(appStoreResponse: AppStoreResponse): Set[ValidatedTransaction] = {
    val statusCodeInt: Int = appStoreResponse.status.toInt
    statusCodeInt match {
      case AutoRenewableSubsStatusCodes.IncorrectSharedSecret => throw new IllegalStateException("Bad App Store password")
      case _ => {
        appStoreResponse.allReceipts.map((receipt: AppStoreResponseReceipt) => {
          validateReceiptAndExtractMaybeLatest(appStoreResponse, statusCodeInt, receipt)
        })

      }
    }
  }

  private def validateReceiptAndExtractMaybeLatest(
    appStoreResponse: AppStoreResponse,
    statusCodeInt: Int,
    receipt: AppStoreResponseReceipt): ValidatedTransaction = {
    val statusAsLong: Long = appStoreResponse.status.toLong

    statusCodeInt match {
      case AutoRenewableSubsStatusCodes.valid | AutoRenewableSubsStatusCodes.ReceiptValidButSubscriptionExpired => ValidatedTransaction(
        receipt.transaction_id,
        validated = true,
        finishTransaction = true,
        Some(ValidatedTransactionPurchase(
          receipt.product_id,
          receipt.web_order_line_item_id,
          ValidatedTransactionPurchaseActiveInterval(
            ofEpochMilli(receipt.purchase_date_ms.toLong).atZone(UTC).format(instantFormatter),
            ofEpochMilli(receipt.expires_date.toLong).atZone(UTC).format(instantFormatter)))), statusAsLong)
      case AutoRenewableSubsStatusCodes.CouldNotReadJson |
        AutoRenewableSubsStatusCodes.MalformedReceiptData |
        AutoRenewableSubsStatusCodes.CouldNotAuthenticateReceipt => ValidatedTransaction(
        receipt.transaction_id,
        validated = false,
        finishTransaction = false,
        None,
        statusAsLong)
      case _ => ValidatedTransaction(receipt.transaction_id, validated = false, finishTransaction = true,
        None, statusAsLong)
    }
  }
}
