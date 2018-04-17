package com.gu.mobilepurchases.shared.lambda

import java.io.{ ByteArrayInputStream, ByteArrayOutputStream, InputStream }
import java.nio.charset.StandardCharsets.UTF_8

import com.fasterxml.jackson.databind.JsonNode
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import com.gu.mobilepurchases.shared.lambda.LambdaApiGatewaySpec.stringAsInputStream
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

object LambdaApiGatewaySpec {
  def stringAsInputStream(str: String): InputStream = new ByteArrayInputStream(str.getBytes(UTF_8))
}

class LambdaApiGatewaySpec extends Specification with ScalaCheck {
  private val genQueryParameters: Gen[(String, String)] = Gen.zip(genCommonAscii, genCommonAscii)

  implicit def arbitraryLambdaRequest: Arbitrary[LambdaRequest] = Arbitrary(for {
    stringOfBinary <- Gen.option[String](genCommonAscii)
    query <- Gen.mapOf[String, String](genQueryParameters)
  } yield LambdaRequest(stringOfBinary, query))

  implicit def arbitraryLambdaResponse: Arbitrary[LambdaResponse] = Arbitrary(for {
    statusCode <- Arbitrary.arbitrary[Int]
    stringOfBinary <- Gen.option[String](genCommonAscii)
    query <- Gen.mapOf[String, String](genQueryParameters)
  } yield LambdaResponse(statusCode, stringOfBinary, query))

  "LambdaApiGatewayTest" should {
    "marshal and unmarshal string properly" in {
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val expectedBodyString: String = """{"test":"content"}"""
      val expectedBodyJson: JsonNode = mapper.readTree(expectedBodyString)
      new LambdaApiGatewayImpl((req: LambdaRequest) => {
        req.queryStringParameters must beEqualTo(Map("Content-Type" -> "application/json"))

        req.maybeBody match {
          case Some(body) => mapper.readTree(body) must beEqualTo(expectedBodyJson)
          case notString  => notString must beEqualTo(Some(expectedBodyJson))
        }
        LambdaResponse(200, Some("""{"test":"body"}"""), Map("Content-Type" -> "application/json"))

      }).execute(stringAsInputStream(
        """{"body":"{\"test\":\"content\"}","isBase64Encoded":false,"queryStringParameters":{"Content-Type":"application/json"}}"""
      ), outputStream)

      mapper.readTree(outputStream.toByteArray) must beEqualTo(mapper.readTree(
        """{"statusCode":200,"isBase64Encoded":false,"headers":{"Content-Type":"application/json"},"body":"{\"test\":\"body\"}"}"""
      ))
    }

    "marshal and unmarshal bytes properly" in {
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      new LambdaApiGatewayImpl((req: LambdaRequest) => {
        throw new IllegalStateException("Should not be called")

      }).execute(stringAsInputStream(
        """{"body":"dGVzdEJhc2U2NGlucHV0","isBase64Encoded":true,"queryStringParameters":{"Content-Type":"text/plain"}}"""
      ), outputStream)
      mapper.readTree(outputStream.toByteArray) must beEqualTo(mapper.readTree(
        """{"statusCode":400,"body":"Binary content not supported","headers":{"Content-Type":"text/plain"},"isBase64Encoded":false}"""
      ))
    }
    "check random lambdaRequest and LambdaResponse convert as expected" >> prop { (request: LambdaRequest, response: LambdaResponse) =>
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream
      new LambdaApiGatewayImpl((req: LambdaRequest) => {
        req must beEqualTo(request)
        response
      }).execute(
        stringAsInputStream(mapper.writeValueAsString(ApiGatewayLambdaRequest(request))), outputStream)
      mapper.readValue[ApiGatewayLambdaResponse](outputStream.toByteArray) must_== ApiGatewayLambdaResponse(response)
    }
    "LambdaRequest to and from Api" >> prop { (lambdaRequest: LambdaRequest) =>
      {
        val renderedRequest: LambdaRequest = LambdaRequest(ApiGatewayLambdaRequest(lambdaRequest))
        renderedRequest must beEqualTo(lambdaRequest)
        renderedRequest.hashCode() must beEqualTo(lambdaRequest.hashCode())
      }
    }
    "LambdaResponse to and from Api" >> prop { (lambdaResponse: LambdaResponse) =>
      {
        val renderedResponse: LambdaResponse = LambdaResponse(ApiGatewayLambdaResponse(lambdaResponse))
        renderedResponse must beEqualTo(lambdaResponse)
        renderedResponse.hashCode() must beEqualTo(lambdaResponse.hashCode())
      }
    }
  }
}
