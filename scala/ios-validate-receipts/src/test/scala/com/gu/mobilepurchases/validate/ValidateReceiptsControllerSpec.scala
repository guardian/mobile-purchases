package com.gu.mobilepurchases.validate

import java.time.Instant

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchMetrics, Timer }
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.validate.ValidateExample.{ successExample, successValidateRequest }
import org.specs2.mutable.Specification

import scala.util.Try

class ValidateReceiptsControllerSpec extends Specification {

  "ValidateReceiptsController" should {
    val metrics: CloudWatchMetrics = new CloudWatchMetrics {
      override def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit, instant: Instant): Boolean = ???

      override def startTimer(metricName: String): Timer = ???

      override def meterHttpStatusResponses(metricName: String, code: Int): Unit = ???
    }

    "marshals and unmarshals correctly using success example" in {
      val requestString: String = successExample.requestString

      new ValidateReceiptsController((validateReceiptRequest: ValidateRequest) => {
        validateReceiptRequest must beEqualTo(successValidateRequest)
        Try(ValidateResponse(Set(ValidateExample.successValidatedTransaction)))
      }, metrics)(LambdaRequest(Some(requestString))) match {
        case LambdaResponse(200, Some(body), headers) => {
          headers must beEqualTo(Map("Content-Type" -> "application/json; charset=UTF-8"))
          mapper.readTree(body) must beEqualTo(mapper.readTree(successExample.responseString))
        }
        case fail => fail must beEqualTo(LambdaResponse(200, Some(successExample.responseString), Map("Content-Type" -> "application/json; charset=UTF-8")))
      }

    }
  }
}
