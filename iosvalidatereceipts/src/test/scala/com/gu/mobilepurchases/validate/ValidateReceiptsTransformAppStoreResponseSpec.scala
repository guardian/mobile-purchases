package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.AppStoreExample.appStoreResponseExample
import com.gu.mobilepurchases.apple.{ AppStoreExample, AppStoreResponse, AppStoreSpec }
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionPurchaseActiveInterval }
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

class ValidateReceiptsTransformAppStoreResponseSpec extends Specification with ScalaCheck {

  "ValidateReceiptsTransformAppStoreResponse" should {
    val validResponse: AppStoreResponse = appStoreResponseExample.copy(
      status = "0",
      receipt = Some(AppStoreExample.appStoreResponseReceiptExample.copy(
        purchase_date_ms = "1349007876000",
        expires_date = "1349007876000",
        transaction_id = "transactionId",
        product_id = "productId",
        web_order_line_item_id = "webOrderLineItemId"

      ))
    )
    val validValidatedTransaction: ValidatedTransaction = ValidatedTransaction("transactionId", 1,
      1,
      ValidatedTransactionPurchase("productId", "webOrderLineItemId", ValidatedTransactionPurchaseActiveInterval("2012-09-30T12:24:36.000Z", "2012-09-30T12:24:36.000Z")), 0)
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
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse.copy(status = "21000"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(
        appStoreStatusResponse = 21000,
        finishTransaction = 0,
        validated = 0
      )))
    }
    "MalformedReceiptData" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse.copy(status = "21002"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(
        appStoreStatusResponse = 21002,
        finishTransaction = 0,
        validated = 0
      )))
    }

    "CouldNotAuthenticateReceipt" in {
      val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(validResponse.copy(status = "21003"))
      transactions must beEqualTo(Set(validValidatedTransaction.copy(
        appStoreStatusResponse = 21003,
        finishTransaction = 0,
        validated = 0
      )))
    }
    "scalacheck" >> {
      implicit val arbitraryAppStoreResponse: Arbitrary[AppStoreResponse] = Arbitrary(AppStoreSpec.genLeafAppStoreResponse)
      prop { (appStoreResponse: AppStoreResponse) =>
        {
          val transactions: Set[ValidatedTransaction] = validateReceiptsTransformAppStoreResponse.transformAppStoreResponse(appStoreResponse)
          transactions must beAnInstanceOf[Set[ValidatedTransaction]]
          transactions.size must beEqualTo(Set(appStoreResponse.latest_expired_receipt_info, appStoreResponse.latest_receipt_Info, appStoreResponse.receipt).flatMap(_.toSet).size)

        }
      }.setArbitrary(arbitraryAppStoreResponse)

    }
  }
}
