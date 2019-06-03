package com.gu.mobilepurchases.shared.lambda

import java.io.{ InputStream, OutputStream }
import java.nio.charset.StandardCharsets

import com.gu.mobilepurchases.shared.external.HttpStatusCodes
import com.gu.mobilepurchases.shared.external.HttpStatusCodes.internalServerError
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import org.apache.commons.io.IOUtils
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.Try

object ApiGatewayLambdaResponse {
  def apply(lambdaResponse: LambdaResponse): ApiGatewayLambdaResponse =
    ApiGatewayLambdaResponse(lambdaResponse.statusCode, lambdaResponse.maybeBody, lambdaResponse.headers, false)

}

case class ApiGatewayLambdaResponse(
    statusCode: Int,
    body: Option[String] = None,
    headers: Map[String, String] = Map(),
    isBase64Encoded: Boolean = false)

object ApiGatewayLambdaRequest {
  def apply(lambdaRequest: LambdaRequest): ApiGatewayLambdaRequest = {
    val parameters: Option[Map[String, String]] = if (lambdaRequest.queryStringParameters.nonEmpty) Some(lambdaRequest.queryStringParameters) else None
    val headers: Option[Map[String, String]] = if (lambdaRequest.headers.nonEmpty) Some(lambdaRequest.headers) else None
    ApiGatewayLambdaRequest(lambdaRequest.maybeBody, false, parameters, headers)
  }

}

case class ApiGatewayLambdaRequest(
    body: Option[String],
    isBase64Encoded: Boolean = false,
    queryStringParameters: Option[Map[String, String]] = None,
    headers: Option[Map[String, String]] = None
)

object LambdaRequest {
  def apply(apiGatewayLambdaRequest: ApiGatewayLambdaRequest): LambdaRequest = {
    LambdaRequest(apiGatewayLambdaRequest.body.map((foundBody: String) => if (apiGatewayLambdaRequest.isBase64Encoded) {
      throw new UnsupportedOperationException("Binary content unsupported")
    } else {
      foundBody
    }), apiGatewayLambdaRequest.queryStringParameters.getOrElse(Map()), apiGatewayLambdaRequest.headers.getOrElse(Map()))
  }
}

case class LambdaRequest(maybeBody: Option[String], queryStringParameters: Map[String, String] = Map(), headers: Map[String, String] = Map()) {}

object LambdaResponse {
  def apply(apiGatewayLambdaResponse: ApiGatewayLambdaResponse): LambdaResponse = {
    LambdaResponse(apiGatewayLambdaResponse.statusCode, apiGatewayLambdaResponse.body.map((foundBody: String) => if (apiGatewayLambdaResponse.isBase64Encoded) {
      throw new UnsupportedOperationException("Binary content unsupported")
    } else {
      foundBody
    }), apiGatewayLambdaResponse.headers)
  }

}

case class LambdaResponse(
    statusCode: Int,
    maybeBody: Option[String],
    headers: Map[String, String]
) {
}

trait LambdaApiGateway {
  def execute(input: InputStream, output: OutputStream): Unit
}

class LambdaApiGatewayImpl(function: (LambdaRequest => LambdaResponse)) extends LambdaApiGateway {
  private val logger: Logger = LogManager.getLogger(classOf[LambdaApiGateway])
  def execute(input: InputStream, output: OutputStream): Unit = {
    try {

      mapper.writeValue(output, objectReadAndClose(input) match {
        case Right(apiGatewayLambdaRequest) =>
          if (apiGatewayLambdaRequest.isBase64Encoded) {
            ApiGatewayLambdaResponse(LambdaResponse(HttpStatusCodes.badRequest, Some("Binary content not supported"), Map("Content-Type" -> "text/plain")))
          } else {
            val lambdaRequest: LambdaRequest = LambdaRequest(apiGatewayLambdaRequest)
            val lambdaResponse: LambdaResponse = function(lambdaRequest)
            ApiGatewayLambdaResponse(lambdaResponse)
          }
        case Left(_) => ApiGatewayLambdaResponse(internalServerError)
      })
    } finally output.close()
  }

  private def objectReadAndClose(input: InputStream): Either[Throwable, ApiGatewayLambdaRequest] = {
    Try {
      try {
        new String(IOUtils.toByteArray(input), StandardCharsets.UTF_8)
      } finally {
        input.close()
      }
    }.toEither.left.map((t: Throwable) => {
      logger.error(s"Unable to read input", t)
      t
    }).flatMap((inputAsString: String) => Try(mapper.readValue[ApiGatewayLambdaRequest](inputAsString)).toEither.left.map((t: Throwable) => {
      logger.error(s"Input not an API Gateway Request: $inputAsString", t)
      t
    }))

  }
}
