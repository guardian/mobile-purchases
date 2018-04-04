package com.gu.mobilepurchases.shared.lambda

import java.io.{ByteArrayInputStream, ByteArrayOutputStream, InputStream}
import java.nio.charset.StandardCharsets
import java.util.UUID

import com.gu.mobilepurchases.shared.external.Base64Utils.encoder
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda._
import org.specs2.mutable.Specification

import scala.util.Random


object LambdaApiGatewaySpec {

  def randomLambdaRequest: LambdaRequest = if (Random.nextBoolean) {
    if (Random.nextBoolean) {
      LambdaRequest(Some(Right(encoder.encode(UUID.randomUUID().toString.getBytes()))))
    } else {
      LambdaRequest(Some(Left(UUID.randomUUID().toString)))
    }
  } else {
    LambdaRequest(None)
  }


  def randomLambdaResponse: LambdaResponse = {
    val randomStatusCode = Random.nextInt()
    val randomHeaders = Map(UUID.randomUUID().toString -> UUID.randomUUID().toString)
    if (Random.nextBoolean) {
      if (Random.nextBoolean) {
        LambdaResponse(randomStatusCode, Some(Right(encoder.encode(UUID.randomUUID().toString.getBytes()))), randomHeaders)
      } else {
        LambdaResponse(randomStatusCode, Some(Left(UUID.randomUUID.toString)), randomHeaders)
      }
    } else {
      LambdaResponse(randomStatusCode, None, randomHeaders)
    }
  }

  def stringAsInputStream(str: String): InputStream = new ByteArrayInputStream(str.getBytes(StandardCharsets.UTF_8))
}

class LambdaApiGatewaySpec extends Specification {
  "LambdaApiGatewayTest" should {
    "work with api gateway lambda proxy" in {
      val outputStream = new ByteArrayOutputStream
      val request = LambdaApiGatewaySpec.randomLambdaRequest
      val response = LambdaApiGatewaySpec.randomLambdaResponse
      new LambdaApiGatewayImpl().execute(
        LambdaApiGatewaySpec.stringAsInputStream(mapper.writeValueAsString(ApiGatewayLambdaRequest
        (request))),
        outputStream,
        req => {
          req match {
            case LambdaRequest(Some(Right(array))) => array must beEqualTo(request.maybeBody.get.right.get)
            case req => req must beEqualTo(request)
          }
          response
        })
      mapper.readValue(outputStream.toByteArray, classOf[ApiGatewayLambdaResponse]) must_== ApiGatewayLambdaResponse(response)
    }
  }
}
