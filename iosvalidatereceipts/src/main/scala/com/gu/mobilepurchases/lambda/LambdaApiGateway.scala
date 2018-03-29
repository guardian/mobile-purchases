package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}

import com.gu.mobilepurchases.lambda.Jackson.mapper
import com.gu.mobilepurchases.lambda.LambdaApiGateway.logger
import org.apache.commons.io.IOUtils
import org.apache.logging.log4j.LogManager


case class LambdaResponse(statusCode: Int, body: Option[String] = None, headers: Map[String, String] = Map("Content-Type" -> "application/json"), isBase64Encoded: Boolean = false)

case class LambdaRequest(body: Some[String])

object LambdaApiGateway {

  val logger = LogManager.getLogger(classOf[ValidateReceiptLambda])
}

class LambdaApiGateway {
  private def stringReadAndClose(input: InputStream): String = {
    try {
      val inputAsString = new String(IOUtils.toByteArray(input))
      logger.info(inputAsString)
      inputAsString
    }
    finally {
      input.close()
    }
  }
  private def objectReadAndClose(input: InputStream): Either[LambdaRequest, Throwable] = {
      val inputAsString = stringReadAndClose(input)
      try {
        Left(mapper.readValue(inputAsString, classOf[LambdaRequest]))
      }
      catch {
        case t: Throwable => {
          logger.error(s"Input not an API Gateway Request: $inputAsString", t)
          Right(t)
        }
      }
  }

  def execute(input: InputStream, output: OutputStream, function: (LambdaRequest => LambdaResponse)) = {
    try {
      mapper.writeValue(output, objectReadAndClose(input) match {
        case Left(inputNode) => function(inputNode)
        case Right(_) => LambdaResponse(500)
      })
    }
    finally {
      output.close
    }
  }
}
