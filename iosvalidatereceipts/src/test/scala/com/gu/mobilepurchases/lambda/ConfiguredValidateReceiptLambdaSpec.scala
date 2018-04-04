package com.gu.mobilepurchases.lambda

import java.io.{ByteArrayInputStream, ByteArrayOutputStream, InputStream, OutputStream}
import java.nio.charset.StandardCharsets

import com.fasterxml.jackson.databind.node.ObjectNode
import com.gu.mobilepurchases.external.Jackson
import com.typesafe.config.ConfigException
import org.specs2.mutable.Specification

class ConfiguredValidateReceiptLambdaSpec extends Specification {

  "ConfiguredValidateReceiptLambda" should {
    "initialize" in {
      new ConfiguredValidateReceiptLambda must throwA[ConfigException]
    }
  }
}
