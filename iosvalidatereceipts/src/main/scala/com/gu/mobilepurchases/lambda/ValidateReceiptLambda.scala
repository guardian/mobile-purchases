package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.gu.mobilepurchases.lambda.Jackson.mapper
import com.gu.mobilepurchases.lambda.ValidateReceiptLambda.lambdaApiGateway


object ValidateReceiptLambda {
  val lambdaApiGateway = new LambdaApiGateway
}

class ValidateReceiptLambda extends RequestStreamHandler {
  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    lambdaApiGateway.execute(input, output, inputNode => LambdaResponse(200, Some(mapper.writeValueAsString(Map("request" -> inputNode.body)))))
  }

}
