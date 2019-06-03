package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.AppStoreExample.appStoreResponseExample
import com.gu.mobilepurchases.apple.{ AppStoreExample, AppStoreResponse, AppStoreSpec }
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionPurchaseActiveInterval }
import org.scalacheck.Arbitrary
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

class ValidateReceiptsTransformAppStoreResponseSpec extends Specification with ScalaCheck {

  "ValidateReceiptsTransformAppStoreResponse" should {
    val validResponse: AppStoreResponse = appStoreResponseExample.copy(
      status = "0",
      receipt = Some(AppStoreExample.appStoreResponseReceiptExample.copy(
        purchase_date_ms = Some("1349007876000"),
        expires_date = Some("1349007876000"),
        transaction_id = "transactionId",
        product_id = Some("productId"),
        web_order_line_item_id = Some("webOrderLineItemId")

      ))
    )
    val validValidatedTransaction: ValidatedTransaction = ValidatedTransaction("transactionId", 1,
      1,
      Some(ValidatedTransactionPurchase("productId", "webOrderLineItemId", ValidatedTransactionPurchaseActiveInterval("2012-09-30T12:24:36.000Z", "2012-09-30T12:24:36.000Z"))), 0)
    val validateReceiptsTransformAppStoreResponse = new ValidateReceiptsTransformAppStoreResponseImpl()

    "valid receipt" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse)
      transactions must beEqualTo(Set(validValidatedTransaction))
    }
    "expired receipt" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse.copy(status = "21006"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(appStoreStatusResponse = 21006)))
    }
    "CouldNotReadJson" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(
        validResponse.copy(status = "21000"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(
        appStoreStatusResponse = 21000,
        finishTransaction = 0,
        validated = 0,
        purchase = None

      )))
    }
    "MalformedReceiptData" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse.copy(status = "21002"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(
        appStoreStatusResponse = 21002,
        finishTransaction = 0,
        validated = 0,
        purchase = None
      )))
    }

    "CouldNotAuthenticateReceipt" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse.copy(status = "21003"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(
        appStoreStatusResponse = 21003,
        finishTransaction = 0,
        validated = 0,
        purchase = None
      )))
    }
  }
}
