package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.validate.ValidateExample.{ successExample, successValidateRequest }
import org.specs2.mutable.Specification

import scala.util.Try

class ValidateReceiptsControllerSpec extends Specification {

  "ValidateReceiptsController" should {
    "marshals and unmarshals correctly using success example" in {
      val requestString: String = successExample.requestString
      new ValidateReceiptsController((validateReceiptRequest: ValidateRequest) => {
        validateReceiptRequest must beEqualTo(successValidateRequest)
        Try(Set(ValidateExample.successValidatedTransaction))
      })(LambdaRequest(Some(requestString))) match {
        case LambdaResponse(200, Some(body), headers) => {
          headers must beEqualTo(Map("Content-Type" -> "application/json"))
          mapper.readTree(body) must beEqualTo(mapper.readTree(successExample.responseString))
        }
        case fail => fail must beEqualTo(LambdaResponse(200, Some(successExample.responseString), Map("Content-Type" -> "application/json")))
      }

    }
  }
}
