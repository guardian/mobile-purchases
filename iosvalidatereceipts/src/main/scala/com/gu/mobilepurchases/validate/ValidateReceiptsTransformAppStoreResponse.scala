package com.gu.mobilepurchases.validate

import java.time.Instant.ofEpochMilli
import java.time.ZoneOffset.UTC

import com.gu.mobilepurchases.apple._
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionPurchaseActiveInterval }
import com.gu.mobilepurchases.userpurchases.UserPurchase.instantFormatter
import org.apache.logging.log4j.LogManager

import scala.util.{ Failure, Success, Try }

trait ValidateReceiptsTransformAppStoreResponse {
  def transformAppStoreResponse(appStoreResponse: AppStoreResponse): Set[ValidatedTransaction]
}

case class ValidatedTransactionAndMaybeLatestReceipt(validatedTransactions: ValidatedTransaction, maybeReceiptData: Option[String])

case class ValidReceiptsResponseWithAnyLaterReceipts(validatedTransactions: Set[ValidatedTransaction], latestReceipts: Set[String])

class ValidateReceiptsTransformAppStoreResponseImpl extends ValidateReceiptsTransformAppStoreResponse {
  val logger = LogManager.getLogger(classOf[ValidateReceiptsTransformAppStoreResponseImpl])
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
    Try {
      statusCodeInt match {
        case AutoRenewableSubsStatusCodes.valid | AutoRenewableSubsStatusCodes.ReceiptValidButSubscriptionExpired => {
          val maybeValidatedTransactionPurchase: Option[ValidatedTransactionPurchase] = for {
            product_id <- receipt.product_id
            web_order_line_item_id <- receipt.web_order_line_item_id
            expires_date <- receipt.expires_date
            purchase_date_ms <- receipt.purchase_date_ms
          } yield ValidatedTransactionPurchase(
            product_id,
            web_order_line_item_id,
            ValidatedTransactionPurchaseActiveInterval(
              ofEpochMilli(purchase_date_ms.toLong).atZone(UTC).format(instantFormatter),
              ofEpochMilli(expires_date.toLong).atZone(UTC).format(instantFormatter)))
          ValidatedTransaction(
            receipt.transaction_id,
            validated = maybeValidatedTransactionPurchase.isDefined,
            finishTransaction = true,
            maybeValidatedTransactionPurchase, statusAsLong)
        }
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
    } match {
      case Success(validatedTransaction: ValidatedTransaction) => validatedTransaction
      case Failure(t) => {
        logger.warn("Error parsing appstore appStoreResponse: {}\nFor receipt: {}", appStoreResponse: Any, receipt: Any)
        throw t
      }
    }

  }
}
