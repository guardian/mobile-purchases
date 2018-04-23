package com.gu.mobilepurchases.lambda

import com.amazonaws.SdkClientException
import org.specs2.mutable.Specification

class ValidateReceiptLambdaSpec extends Specification {

  "ConfiguredValidateReceiptLambda" should {
    "initialize" in {
      new ValidateReceiptLambda() must throwA[SdkClientException]
    }
  }
}
