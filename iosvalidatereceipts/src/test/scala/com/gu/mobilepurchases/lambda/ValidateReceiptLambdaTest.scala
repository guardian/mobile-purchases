package com.gu.mobilepurchases.lambda

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}
import java.nio.charset.StandardCharsets

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.gu.mobilepurchases.lambda.ValidateReceiptLambdaTest.mapper
import org.specs2.mutable.Specification
object ValidateReceiptLambdaTest {
  val mapper = new ObjectMapper
}

class ValidateReceiptLambdaTest extends Specification {

  "ValidateReceiptLambda" should {
    "work with api gateway lambda proxy" in {
      val bais = new ByteArrayInputStream("""{"body":"test","body2":"test"}""".getBytes(StandardCharsets.UTF_8))
      val baos = new ByteArrayOutputStream()
      new ValidateReceiptLambda().handleRequest(bais, baos, null)
      val output = new String(baos.toByteArray)
      val outputExpected = mapper.createObjectNode()
      outputExpected.put("request", "test")

      mapper.readTree(mapper.readTree(output).asInstanceOf[ObjectNode].get("body").asText()) must_== outputExpected
    }
  }
}
