package com.gu.mobilepurchases.validate

import java.nio.charset.StandardCharsets

import com.fasterxml.jackson.annotation.JsonProperty
import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.external.HttpStatusCodes
import com.gu.mobilepurchases.shared.external.HttpStatusCodes.{badRequest, okCode}
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{LambdaRequest, LambdaResponse}
import com.gu.mobilepurchases.validate.ValidateReceiptsControllerImpl.{errorHeaders, successHeaders}
import org.apache.http.HttpHeaders
import org.apache.http.entity.ContentType
import org.apache.logging.log4j.{LogManager, Logger}

import scala.util.Try

case class ValidateRequestTransaction(id: String,
                                      receipt: String,
                                      @JsonProperty("type") typeField: String)

case class ValidateRequestAppInfo(id: String)

case class ValidateRequestUserIds(gnmUdid: String, vendorUdid: String)

case class ValidateRequest(userIds: ValidateRequestUserIds,
                           deviceInfo: Map[String, String],
                           appInfo: ValidateRequestAppInfo,
                           transactions: List[ValidateRequestTransaction],
                           nominatedHandler: String) {
  def receipts: Set[String] = transactions.map((_: ValidateRequestTransaction).receipt).toSet
}


case class ValidateResponse(transactions: Set[ValidatedTransaction])

object ValidateReceiptsControllerImpl {
  val errorHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.TEXT_PLAIN.withCharset(StandardCharsets.UTF_8).toString)
  val successHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.APPLICATION_JSON.getMimeType)
  val logger: Logger = LogManager.getLogger(classOf[ValidateReceiptsControllerImpl])
}

class ValidateReceiptsControllerImpl(
                                      validateReceiptsRoute: ValidateReceiptsRoute
                                    ) extends Function[LambdaRequest, LambdaResponse] {
  def apply(lambdaRequest: LambdaRequest): LambdaResponse =
    lambdaRequest match {
      case LambdaRequest(Some(Left(json)), _) => validate(Try(mapper.readValue[ValidateRequest](json)))
      case LambdaRequest(Some(Right(bytes)), _) => validate(Try(mapper.readValue[ValidateRequest](bytes)))
      case LambdaRequest(None, _) => LambdaResponse(badRequest, Some(Left("Expected a json body")), errorHeaders)
    }

  private def validate(triedRequest: Try[ValidateRequest]): LambdaResponse = triedRequest
    .map((validateRequest: ValidateRequest) =>
      validateReceiptsRoute.route(validateRequest)
        .map((transactions: Set[ValidatedTransaction]) => LambdaResponse(okCode, Some(Left(mapper.writeValueAsString(ValidateResponse(transactions)))), successHeaders))
        .getOrElse(LambdaResponse(HttpStatusCodes.internalServerError, Some(Left("Failed to persist")), errorHeaders)
        )).fold((t: Throwable) => {
    ValidateReceiptsControllerImpl.logger.warn("Error validating", t)
    LambdaResponse(badRequest, Some(Left("Cannot read json body")), errorHeaders)
  }, (x: LambdaResponse) => x)

}
