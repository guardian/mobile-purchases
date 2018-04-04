package com.gu.mobilepurchases.lambda

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets

import com.fasterxml.jackson.databind.node.ObjectNode
import com.gu.mobilepurchases.shared.external.Jackson
import com.gu.mobilepurchases.shared.lambda.{LambdaApiGatewayImpl, LambdaRequest, LambdaResponse}
import org.specs2.mutable.Specification


class ValidateReceiptLambdaSpec extends Specification {

  "ValidateReceiptLambda" should {
    "work with api gateway lambda proxy" in {
      val byteArrayInputStream = new ByteArrayInputStream("""{"body":"test","body2":"test"}""".getBytes(StandardCharsets.UTF_8))
      val byteArrayOutputStream = new ByteArrayOutputStream()
      new ValidateReceiptLambda((lambdaRequest: LambdaRequest) => {
        lambdaRequest.maybeBody must beEqualTo(Some(Left("test")))
        LambdaResponse(200, Some(Left("""test""")))
      }, new LambdaApiGatewayImpl) {}.handleRequest(byteArrayInputStream, byteArrayOutputStream, null)
      val output = new String(byteArrayOutputStream.toByteArray)
      Jackson.mapper.readTree(output).asInstanceOf[ObjectNode].get("body").asText() must_== "test"
    }
  }
}
