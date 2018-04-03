package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}
import java.nio.charset.StandardCharsets

import com.gu.mobilepurchases.external.Base64Utils.{IsBase64Encoded, IsNotBase64Encoded, decoder, encoder}
import com.gu.mobilepurchases.external.HttpStatusCodes
import com.gu.mobilepurchases.external.HttpStatusCodes.internalServerError
import com.gu.mobilepurchases.external.Jackson.mapper
import com.gu.mobilepurchases.lambda.LambdaApiGateway.logger
import com.gu.mobilepurchases.validate.ValidateReceiptLambda
import org.apache.commons.io.IOUtils
import org.apache.logging.log4j.{LogManager, Logger}


object ApiGatewayLambdaResponse {
  def apply(lambdaResponse: LambdaResponse): ApiGatewayLambdaResponse =
    lambdaResponse.maybeBody match {
      case Some(body) => body match {
        case Left(str) => ApiGatewayLambdaResponse(lambdaResponse.statusCode, Some(str), lambdaResponse.headers, IsNotBase64Encoded)
        case Right(array) => ApiGatewayLambdaResponse(
          lambdaResponse.statusCode,
          Some(new String(encoder.encode(array))),
          lambdaResponse.headers,
          IsBase64Encoded)
      }
      case None => ApiGatewayLambdaResponse(lambdaResponse.statusCode, None, lambdaResponse.headers)
    }
}

case class ApiGatewayLambdaResponse(
                                     statusCode: Int,
                                     body: Option[String] = None,
                                     headers: Map[String, String] = Map("Content-Type" -> "application/json"),
                                     isBase64Encoded: Boolean = IsNotBase64Encoded)

object ApiGatewayLambdaRequest {
  def apply(lambdaRequest: LambdaRequest): ApiGatewayLambdaRequest =
    lambdaRequest.maybeBody match {
      case Some(body) => body match {
        case Left(str) => ApiGatewayLambdaRequest(Some(str), IsNotBase64Encoded)
        case Right(array) => ApiGatewayLambdaRequest(Some(new String(encoder.encode(array))), IsBase64Encoded)
      }
      case None => ApiGatewayLambdaRequest(None)
    }

}

case class ApiGatewayLambdaRequest(body: Option[String], isBase64Encoded: Boolean = IsNotBase64Encoded)


object LambdaRequest {
  def apply(apiGatewayLambdaRequest: ApiGatewayLambdaRequest): LambdaRequest = {
    LambdaRequest(apiGatewayLambdaRequest.body.map(foundBody => if (apiGatewayLambdaRequest.isBase64Encoded) {
      Right(decoder.decode(foundBody))
    } else {
      Left(foundBody)
    }))
  }
}

case class LambdaRequest(maybeBody: Option[Either[String, Array[Byte]]])

object LambdaResponse {
  def apply(apiGatewayLambdaResponse: ApiGatewayLambdaResponse): LambdaResponse = {
    LambdaResponse(apiGatewayLambdaResponse.statusCode, apiGatewayLambdaResponse.body.map(foundBody => if (apiGatewayLambdaResponse.isBase64Encoded) {
      Right(decoder.decode(foundBody))
    } else {
      Left(foundBody)
    }), apiGatewayLambdaResponse.headers)
  }
}

case class LambdaResponse(
                           statusCode: Int,
                           maybeBody: Option[Either[String, Array[Byte]]],
                           headers: Map[String, String] = Map("Content-Type" -> "application/json")
                         )

object LambdaApiGateway {
  val logger: Logger = LogManager.getLogger(classOf[ValidateReceiptLambda])
}

trait LambdaApiGateway {
  def execute(input: InputStream, output: OutputStream, function: (LambdaRequest => LambdaResponse)): Unit
}


class LambdaApiGatewayImpl extends LambdaApiGateway {
  def execute(input: InputStream, output: OutputStream, function: (LambdaRequest => LambdaResponse)): Unit = {
    try {
      mapper.writeValue(output, objectReadAndClose(input) match {
        case Left(apiGatewayLambdaRequest) => ApiGatewayLambdaResponse(function(LambdaRequest(apiGatewayLambdaRequest)))
        case Right(_) => ApiGatewayLambdaResponse(internalServerError)
      })
    }
    finally output.close()

  }

  private def objectReadAndClose(input: InputStream): Either[ApiGatewayLambdaRequest, Throwable] = {
    val inputAsString = stringReadAndClose(input)
    try {
      Left(mapper.readValue(inputAsString, classOf[ApiGatewayLambdaRequest]))
    }
    catch {
      case t: Throwable => logger.error(s"Input not an API Gateway Request: $inputAsString", t)
        Right(t)
    }
  }

  private def stringReadAndClose(input: InputStream): String = {
    try {
      val inputAsString = new String(IOUtils.toByteArray(input), StandardCharsets.UTF_8)
      logger.info(inputAsString)
      inputAsString
    }
    finally {
      input.close()
    }
  }
}
