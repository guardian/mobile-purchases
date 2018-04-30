package com.gu.mobilepurchases

import java.io.{ ByteArrayInputStream, ByteArrayOutputStream }
import java.nio.charset.StandardCharsets
import java.nio.file.{ Files, Paths }

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchAsync }
import com.fasterxml.jackson.databind.JsonNode
import com.gu.mobilepurchases.ValidateToAppleSpec.testResponseJson
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchImpl, CloudWatchImplSpec }
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ ApiGatewayLambdaRequest, ApiGatewayLambdaResponse, AwsLambda }
import com.gu.mobilepurchases.validate._
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.util.Success
object ValidateToAppleSpec {

  private def readResource(resource: String): Array[Byte] = {
    Files.readAllBytes(Paths.get(ClassLoader.getSystemResource(resource).toURI))
  }
  val testRequestBytes: Array[Byte] = readResource("endtoend/success-sandbox/request.json")
  val testResponseBytes: Array[Byte] = readResource("endtoend/success-sandbox/response.json")
  val testResponseJson: JsonNode = mapper.readTree(testResponseBytes)
}
class ValidateToAppleSpec extends Specification with Mockito {
  "ValidateReceiptLambdaMockedApple" should {
    "success sandbox" in {
      val lambda: AwsLambda = new AwsLambda(new ValidateReceiptsController(
        (validateReceiptRequest: ValidateRequest) => {
          validateReceiptRequest must beEqualTo(null)
          Success(ValidateResponse(Set()))
        }
      ), cloudWatch = new CloudWatchImpl("", "lambdaname", CloudWatchImplSpec.mockSuccessfullySendMetrics(_ => ()))) {}
      val byteArrayOutputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      lambda.handleRequest(
        new ByteArrayInputStream(mapper.writeValueAsBytes(
          ApiGatewayLambdaRequest(
            Some(new String(ValidateToAppleSpec.testRequestBytes, StandardCharsets.UTF_8)),
            isBase64Encoded = false))),
        byteArrayOutputStream,
        null)

      mapper.readTree(
        mapper.readValue[ApiGatewayLambdaResponse](byteArrayOutputStream.toByteArray).body.get
      ) must beEqualTo(testResponseJson)
    }.pendingUntilFixed()

  }

}