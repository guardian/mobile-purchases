package com.gu.mobilepurchases.userpurchases.lambda

import java.io.{InputStream, OutputStream}

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.gu.mobilepurchases.shared.external.Jackson
import com.gu.mobilepurchases.shared.lambda.{ApiGatewayLambdaRequest, LambdaApiGateway, LambdaApiGatewayImpl, LambdaResponse}
import com.gu.mobilepurchases.userpurchases.lambda.UserPurchasesLambda.logger
import org.apache.logging.log4j.LogManager

object UserPurchasesLambda {
  val logger = LogManager.getLogger(classOf[UserPurchasesLambda])
}

class UserPurchasesLambda(

                           lambdaApiGateway: LambdaApiGateway = new LambdaApiGatewayImpl
                         ) extends RequestStreamHandler {

  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    try {
      lambdaApiGateway.execute(input, output, lambdaRequest => {
        logger.warn(s"Request was ${Jackson.mapper.writeValueAsString(ApiGatewayLambdaRequest(lambdaRequest))}")
        LambdaResponse(400, Some(Left("Not supported yet")))
      })
    }
    catch {
      case t: Throwable => logger.warn(s"Error executing lambda", t)
    }
  }
}
