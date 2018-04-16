package com.gu.mobilepurchases.lambda

import org.specs2.mutable.Specification

class ValidateReceiptLambdaSpec extends Specification {

  "ConfiguredValidateReceiptLambda" should {
    "initialize" in {
      new ValidateReceiptLambda() must throwA[IllegalStateException]
    }
  }
}
