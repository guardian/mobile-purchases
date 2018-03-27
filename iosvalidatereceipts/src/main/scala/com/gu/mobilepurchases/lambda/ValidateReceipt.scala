package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}
import java.nio.charset.StandardCharsets.UTF_8

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import com.gu.mobilepurchases.lambda.ValidateReceipt.mapper
import org.apache.commons.io.IOUtils


object ValidateReceipt {
  val mapper = new ObjectMapper
  mapper.registerModule(DefaultScalaModule)
}

class ValidateReceipt extends RequestStreamHandler {

  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    def readAndClose(input: InputStream): String = {
      try {
        IOUtils.toString(input, UTF_8)
      }
      finally {
        input.close
      }
    }

    try {
      val inputString = readAndClose(input)
      val outputBody = s"Hello $inputString"
      val objectNode = mapper.createObjectNode
      objectNode.put("statusCode", 200)
      objectNode.set("headers", mapper.createObjectNode)
      objectNode.put("body", outputBody)
      objectNode.put("isBase64Encoded", false)
      mapper.writeValue(output, objectNode)
    }
    finally {
      output.close
    }


  }

}
