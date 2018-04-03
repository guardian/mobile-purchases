package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.external.Jackson
import com.gu.mobilepurchases.lambda.LambdaRequest
import org.specs2.mutable.Specification

class ValidateReceiptsControllerSpec extends Specification {

  "ValidateReceiptsController" should {
    "marshalls and unmarshalls correctly using success example" in {

      class MockValidateReceiptsValidator extends ValidateReceiptsValidator {
        override def validate(transaction: ValidateRequestTransaction): ValidatedTransaction = {
          transaction must_== ValidateExample.successValidateRequestTransaction
          ValidateExample.successValidatedTransaction
        }
      }
      val response = new ValidateReceiptsControllerImpl(new MockValidateReceiptsValidator).validate(
        LambdaRequest(Some(Left(ValidateExample.successExample.requestString))))
      response.maybeBody.map(_.left.map(Jackson.mapper.readTree)) must_== Some(Left(Jackson.mapper.readTree(ValidateExample.successExample.responseString)))
    }
  }
}
