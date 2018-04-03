package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.{AppStore, AppStoreExample, AppStoreResponse}
import com.gu.mobilepurchases.validate.ValidateExample.{successProdValidatedTransaction, successValidateRequestTransaction}
import org.specs2.mutable.Specification

class ValidateReceiptsValidatorSpec extends Specification {
  "ValidateReceiptsValidator" should {
    "marshals and unmarshals correctly using success example" in {
      val validatedTransaction = new ValidateReceiptsValidatorImpl((receiptData: String) => {
        AppStoreExample.successAsAppStoreResponse
      }).validate(successValidateRequestTransaction)
      validatedTransaction must beEqualTo(successProdValidatedTransaction)
    }
  }

}
