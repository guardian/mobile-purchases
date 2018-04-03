package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.{AppStore, AppStoreExample, AppStoreResponse}
import com.gu.mobilepurchases.validate.ValidateExample.{successProdValidatedTransaction, successValidateRequestTransaction}
import org.specs2.mutable.Specification

class ValidateReceiptsValidatorSpec extends Specification {
  "ValidateReceiptsValidator" should {
    "marshalls and unmarshalls correctly using success example" in {
      val validatedTransaction = new ValidateReceiptsValidatorImpl(new AppStore {
        override def send(receiptData: String): AppStoreResponse = {
          AppStoreExample.successAsAppStoreResponse
        }
      }).validate(successValidateRequestTransaction)
      validatedTransaction must beEqualTo(successProdValidatedTransaction)
    }
  }

}
