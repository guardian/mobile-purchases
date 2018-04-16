package com.gu.mobilepurchases.userpurchases.lambda

import org.specs2.mutable.Specification

class UserPurchasesLambdaSpec extends Specification {
  "UserPurchasesLambda" should {
    "initialize" in {

      new UserPurchasesLambda() must throwA[IllegalStateException]
    }
  }
}
