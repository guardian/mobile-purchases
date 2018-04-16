package com.gu.mobilepurchases.shared.lambda

import java.io.{InputStream, OutputStream}
import java.nio.charset.StandardCharsets
import java.util

import com.gu.mobilepurchases.shared.external.Base64Utils.{IsBase64Encoded, IsNotBase64Encoded, decoder, encoder}
import com.gu.mobilepurchases.shared.external.HttpStatusCodes.internalServerError
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.LambdaApiGateway.logger
import org.apache.commons.io.IOUtils
import org.apache.logging.log4j.{LogManager, Logger}

import scala.util.Try


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
                                     headers: Map[String, String] = Map(),
                                     isBase64Encoded: Boolean = IsNotBase64Encoded)

object ApiGatewayLambdaRequest {
  def apply(lambdaRequest: LambdaRequest): ApiGatewayLambdaRequest = {
    val parameters: Option[Map[String, String]] = if (lambdaRequest.queryStringParameters.nonEmpty) Some(lambdaRequest.queryStringParameters) else None
    lambdaRequest.maybeBody match {
      case Some(body) =>
        body match {
          case Left(str) => ApiGatewayLambdaRequest(Some(str), IsNotBase64Encoded, parameters)
          case Right(array) => ApiGatewayLambdaRequest(Some(new String(encoder.encode(array))), IsBase64Encoded, parameters)
        }
      case None => ApiGatewayLambdaRequest(None, isBase64Encoded = false, parameters)
    }
  }

}

case class ApiGatewayLambdaRequest(
                                    body: Option[String],
                                    isBase64Encoded: Boolean = IsNotBase64Encoded,
                                    queryStringParameters: Option[Map[String, String]] = None
                                  )


object LambdaRequest {
  def apply(apiGatewayLambdaRequest: ApiGatewayLambdaRequest): LambdaRequest = {
    LambdaRequest(apiGatewayLambdaRequest.body.map((foundBody:String) => if (apiGatewayLambdaRequest.isBase64Encoded) {
      Right(decoder.decode(foundBody))
    } else {
      Left(foundBody)
    }), apiGatewayLambdaRequest.queryStringParameters.getOrElse(Map()))
  }
}

case class LambdaRequest(maybeBody: Option[Either[String, Array[Byte]]], queryStringParameters: Map[String, String] = Map()) {
  override def hashCode(): Int = maybeBody match {
    case Some(Right(bytes)) => (queryStringParameters, util.Arrays.hashCode(bytes)).##
    case _ => (queryStringParameters, maybeBody).##
  }


  override def equals(obj: Any): Boolean =
    if (!obj.isInstanceOf[LambdaRequest]) {
      false
    }
    else {
      val otherLambdaRequest:LambdaRequest = obj.asInstanceOf[LambdaRequest]
      queryStringParameters.equals(otherLambdaRequest.queryStringParameters) && (maybeBody match {
        case Some(Right(bytes)) => otherLambdaRequest.maybeBody match {
          case Some(Right(otherBytes)) => util.Arrays.equals(bytes, otherBytes)
          case _ => false
        }
        case _ => otherLambdaRequest.maybeBody match {
          case Some(Right(_)) => false
          case _ => maybeBody.equals(otherLambdaRequest.maybeBody)
        }
      })
    }
}


object LambdaResponse {
  def apply(apiGatewayLambdaResponse: ApiGatewayLambdaResponse): LambdaResponse = {
    LambdaResponse(apiGatewayLambdaResponse.statusCode, apiGatewayLambdaResponse.body.map((foundBody:String) => if (apiGatewayLambdaResponse.isBase64Encoded) {
      Right(decoder.decode(foundBody))
    } else {
      Left(foundBody)
    }), apiGatewayLambdaResponse.headers)
  }


}

case class LambdaResponse(
                           statusCode: Int,
                           maybeBody: Option[Either[String, Array[Byte]]],
                           headers: Map[String, String]
                         ) {
  override def hashCode(): Int = {
    maybeBody match {
      case Some(Right(bytes)) => (statusCode, headers, util.Arrays.hashCode(bytes)).##
      case _ => (statusCode, headers, maybeBody).##
    }
  }

  override def equals(obj: Any): Boolean = {
    if (!obj.isInstanceOf[LambdaResponse]) {
      false
    }
    else {
      val otherResponse:LambdaResponse = obj.asInstanceOf[LambdaResponse]
      statusCode.equals(otherResponse.statusCode) && headers.equals(otherResponse.headers) && (maybeBody match {
        case Some(Right(body)) => otherResponse.maybeBody match {
          case Some(Right(otherBody)) => util.Arrays.equals(body, otherBody)
          case _ => false
        }
        case _ => otherResponse.maybeBody match {
          case Some(Right(_)) => false
          case _ => maybeBody.equals(otherResponse.maybeBody)
        }
      })
    }

  }
}

object LambdaApiGateway {
  val logger: Logger = LogManager.getLogger(classOf[LambdaApiGateway])
}

trait LambdaApiGateway {
  def execute(input: InputStream, output: OutputStream): Unit
}

class LambdaApiGatewayImpl(function: (LambdaRequest => LambdaResponse)) extends LambdaApiGateway {
  def execute(input: InputStream, output: OutputStream): Unit = {
    try {
      mapper.writeValue(output, objectReadAndClose(input) match {
        case Right(apiGatewayLambdaRequest) =>
          val lambdaRequest:LambdaRequest = LambdaRequest(apiGatewayLambdaRequest)
          val lambdaResponse:LambdaResponse = function(lambdaRequest)
          ApiGatewayLambdaResponse(lambdaResponse)
        case Left(_) => ApiGatewayLambdaResponse(internalServerError)
      })
    }
    finally output.close()
  }

  private def objectReadAndClose(input: InputStream): Either[Throwable, ApiGatewayLambdaRequest] = {
    Try {
      try {
        new String(IOUtils.toByteArray(input), StandardCharsets.UTF_8)
      }
      finally {
        input.close()
      }
    }.toEither.left.map((t:Throwable) => {
      logger.error(s"Unable to read input", t)
      t
    }).flatMap((inputAsString:String) => Try(mapper.readValue[ApiGatewayLambdaRequest](inputAsString)).toEither.left.map((t:Throwable) => {
      logger.error(s"Input not an API Gateway Request: $inputAsString", t)
      t
    }))

  }
}
