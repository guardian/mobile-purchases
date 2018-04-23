package com.gu.mobilepurchases.shared.lambda

import java.io.{ InputStream, OutputStream }

import com.amazonaws.services.lambda.runtime.{ Context, RequestStreamHandler }
import com.gu.mobilepurchases.shared.cloudwatch.CloudWatch
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.Try

abstract class AwsLambda(function: LambdaRequest => LambdaResponse, logger: Logger = LogManager.getLogger(classOf[AwsLambda]), cloudWatch: CloudWatch) extends RequestStreamHandler {

  private val lambdaApiGateway: LambdaApiGatewayImpl = new LambdaApiGatewayImpl(function)

  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = Try {
    lambdaApiGateway.execute(input, output)
    cloudWatch.sendMetricsSoFar()
  }.recover {
    case t: Throwable =>
      logger.warn(s"Error executing lambda", t)
      throw t
  }
}
