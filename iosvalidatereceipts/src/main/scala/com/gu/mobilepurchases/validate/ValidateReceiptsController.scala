package com.gu.mobilepurchases.validate

import java.nio.charset.StandardCharsets

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.fasterxml.jackson.annotation.JsonProperty
import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchMetrics }
import com.gu.mobilepurchases.shared.external.HttpStatusCodes
import com.gu.mobilepurchases.shared.external.HttpStatusCodes.{ badRequest, internalServerError, okCode }
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.validate.ValidateReceiptsController.{ errorHeaders, serverError, successHeaders }
import org.apache.http.HttpHeaders
import org.apache.http.entity.ContentType
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.{ Failure, Success, Try }

case class ValidateRequestTransaction(
    id: String,
    receipt: String,
    @JsonProperty("type") typeField: String)

case class ValidateRequestAppInfo(id: String)

case class ValidateRequestUserIds(gnmUdid: String, vendorUdid: String)

case class ValidateRequest(
    userIds: Map[String, String],
    deviceInfo: Map[String, String],
    appInfo: ValidateRequestAppInfo,
    transactions: List[ValidateRequestTransaction],
    nominatedHandler: String) {
  def receipts: Set[String] = transactions.map((_: ValidateRequestTransaction).receipt).toSet
}

case class ValidateResponse(transactions: Set[ValidatedTransaction])

object ValidateReceiptsController {
  val errorHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.TEXT_PLAIN.withCharset(StandardCharsets.UTF_8).toString)
  val successHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.APPLICATION_JSON.toString)
  private val serverError: LambdaResponse = LambdaResponse(internalServerError, Some("Failed to process request"), errorHeaders)
}

class ValidateReceiptsController(
    validateReceiptsRoute: ValidateReceiptsRoute,
    cloudWatchMetrics: CloudWatchMetrics
) extends Function[LambdaRequest, LambdaResponse] {

  private val logger: Logger = LogManager.getLogger(classOf[ValidateReceiptsController])

  def apply(lambdaRequest: LambdaRequest): LambdaResponse =
    lambdaRequest match {
      case LambdaRequest(Some(json), _, _) => validate(Try(mapper.readValue[ValidateRequest](json)))
      case LambdaRequest(None, _, _)       => LambdaResponse(badRequest, Some("Expected a json body"), errorHeaders)
    }

  private def validate(triedRequest: Try[ValidateRequest]): LambdaResponse = triedRequest
    .map(routeValidRequest) match {
      case Success(response) => response
      case Failure(throwable) =>
        logger.warn("Error validating", throwable)
        cloudWatchMetrics.queueMetric("route-failed", 1, StandardUnit.Count)
        LambdaResponse(internalServerError, Some("Cannot read json body"), errorHeaders)
    }

  private def routeValidRequest(validateRequest: ValidateRequest): LambdaResponse = {

    validateReceiptsRoute.route(validateRequest) match {
      case Success(validateResponse) => LambdaResponse(
        okCode, Some(mapper.writeValueAsString(validateResponse)), successHeaders)
      case Failure(t) => {
        cloudWatchMetrics.queueMetric("route-failed", 1, StandardUnit.Count)
        logger.warn("Error validating", t)
        serverError
      }

    }

  }
}
