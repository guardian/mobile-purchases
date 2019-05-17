package com.gu.mobilepurchases.gpubsub

import com.amazonaws.services.lambda.runtime.{Context, RequestHandler}
import com.amazonaws.services.lambda.runtime.events.{APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent}
import com.gu.mobilepurchases.shared.lambda.LambdaApiGateway
import org.apache.logging.log4j.{LogManager, Logger}

class Lambda extends RequestHandler[APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent] {

  private val logger: Logger = LogManager.getLogger(classOf[LambdaApiGateway])

  override def handleRequest(input: APIGatewayProxyRequestEvent, context: Context): APIGatewayProxyResponseEvent = {
    logger.info(input.toString)

    new APIGatewayProxyResponseEvent()
      .withStatusCode(200)
  }
}
