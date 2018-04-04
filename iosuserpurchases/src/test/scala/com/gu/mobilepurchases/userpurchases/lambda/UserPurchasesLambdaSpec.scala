package com.gu.mobilepurchases.userpurchases.lambda

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets

import com.gu.mobilepurchases.lambda.LambdaApiGatewaySpec
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda._
import org.specs2.mutable.Specification

class UserPurchasesLambdaSpec extends Specification {
  "UserPurchasesLambda" should {
    "initialize" in {
      val outputStream = new ByteArrayOutputStream
      val request = LambdaApiGatewaySpec.randomLambdaRequest

      new UserPurchasesLambda().handleRequest(
        new ByteArrayInputStream(mapper.writeValueAsString(ApiGatewayLambdaRequest(request)).getBytes(StandardCharsets.UTF_8)),
        outputStream, null)
      mapper.readValue(outputStream.toByteArray, classOf[ApiGatewayLambdaResponse]) must beEqualTo( ApiGatewayLambdaResponse(LambdaResponse(400, Some(Left("Not supported yet")))))
    }
  }
}
