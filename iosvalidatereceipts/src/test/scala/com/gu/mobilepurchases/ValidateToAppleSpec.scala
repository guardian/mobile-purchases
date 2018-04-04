package com.gu.mobilepurchases

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Paths}

import com.gu.mobilepurchases.apple.{AppStore, AppStoreResponse}
import com.gu.mobilepurchases.lambda.ValidateReceiptLambda
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ApiGatewayLambdaRequest, ApiGatewayLambdaResponse, LambdaApiGatewayImpl}
import com.gu.mobilepurchases.validate.{ValidateReceiptsControllerImpl, ValidateReceiptsValidatorImpl}
import org.specs2.mutable.Specification


class ValidateToAppleSpec extends Specification {
  "ValidateReceiptLambdaMockedApple" should {
    "success sandbox" in {
      val lambda = new ValidateReceiptLambda(new ValidateReceiptsControllerImpl(new ValidateReceiptsValidatorImpl(new AppStore {
        override def send(receiptData: String): AppStoreResponse = null
      })), new LambdaApiGatewayImpl) {}
      val byteArrayOutputStream = new ByteArrayOutputStream()
      lambda.handleRequest(new ByteArrayInputStream(mapper.writeValueAsBytes(
        ApiGatewayLambdaRequest(
          Some(new String(readResource("endtoend/success-sandbox/request.json"), StandardCharsets.UTF_8)),
          false))),
        byteArrayOutputStream,
        null)
      mapper.readTree(
        mapper.readValue(byteArrayOutputStream.toByteArray, classOf[ApiGatewayLambdaResponse]).body.get
      ) must beEqualTo(mapper.readTree(readResource("endtoend/success-sandbox/response.json")))
    }.pendingUntilFixed()

  }

  private def readResource(resource: String): Array[Byte] = {
    Files.readAllBytes(Paths.get(ClassLoader.getSystemResource(resource).toURI))
  }
}