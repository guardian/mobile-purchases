package com.gu.mobilepurchases

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ApiGatewayLambdaRequest, ApiGatewayLambdaResponse, AwsLambda}
import com.gu.mobilepurchases.validate._
import org.specs2.mutable.Specification

import scala.util.{Success, Try}


class ValidateToAppleSpec extends Specification {
  "ValidateReceiptLambdaMockedApple" should {
    "success sandbox" in {
      val lambda: AwsLambda = new AwsLambda(new ValidateReceiptsControllerImpl(
        (validateReceiptRequest: ValidateRequest) => {
          validateReceiptRequest must beEqualTo(null)
          Success(Set())
        }
      )) {}
      val byteArrayOutputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      lambda.handleRequest(new ByteArrayInputStream(mapper.writeValueAsBytes(
        ApiGatewayLambdaRequest(
          Some(new String(readResource("endtoend/success-sandbox/request.json"), StandardCharsets.UTF_8)),
          isBase64Encoded = false))),
        byteArrayOutputStream,
        null)
      mapper.readTree(
        mapper.readValue[ApiGatewayLambdaResponse](byteArrayOutputStream.toByteArray).body.get
      ) must beEqualTo(mapper.readTree(readResource("endtoend/success-sandbox/response.json")))
    }.pendingUntilFixed()

  }

  private def readResource(resource: String): Array[Byte] = {
    Files.readAllBytes(Paths.get(ClassLoader.getSystemResource(resource).toURI))
  }
}