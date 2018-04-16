package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{LambdaRequest, LambdaResponse}
import com.gu.mobilepurchases.validate.ValidateExample.{successExample, successValidateRequest}
import org.specs2.mutable.Specification

import scala.util.Try

object ValidateReceiptsController {

}

class ValidateReceiptsControllerSpec extends Specification {


  "ValidateReceiptsController" should {
    "marshals and unmarshals correctly using success example" in {
      val requestString: String = successExample.requestString
      new ValidateReceiptsControllerImpl((validateReceiptRequest: ValidateRequest) => {
        validateReceiptRequest must beEqualTo(successValidateRequest)
        Try(Set(ValidateExample.successValidatedTransaction))
      })(LambdaRequest(Some(Left(requestString)))) match {
        case LambdaResponse(200, Some(Left(body)), headers) => {
          headers must beEqualTo(Map("Content-Type" -> "application/json"))
          mapper.readTree(body) must beEqualTo(mapper.readTree(successExample.responseString))
        }
        case fail => fail must beEqualTo(LambdaResponse(200, Some(Left(successExample.responseString)), Map("Content-Type" -> "application/json")))
      }

    }
  }
}
