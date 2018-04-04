package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.gu.mobilepurchases.apple.{AppStoreConfig, AppStoreImpl}
import com.gu.mobilepurchases.config.SsmConfig
import com.gu.mobilepurchases.validate._
import com.gu.AwsIdentity
import com.gu.mobilepurchases.external.Logging
import org.apache.logging.log4j.{LogManager, Logger}
object ValidateReceiptLambda {
  val logger:Logger = LogManager.getLogger(classOf[ValidateReceiptLambda])
}
abstract class ValidateReceiptLambda(
                                      validateReceipts: ValidateReceiptsController,
                                      lambdaApiGateway: LambdaApiGateway
                                    ) extends RequestStreamHandler {
  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    try {
      lambdaApiGateway.execute(input, output, validateReceipts.validate)
    }
    catch {
      case t:Throwable => ValidateReceiptLambda.logger.warn(s"Error executing lambda", t)
    }
  }
}

object ConfiguredValidateReceiptLambda {
  lazy val ssmConfig = new SsmConfig()
  lazy val validateReceipts: ValidateReceiptsController = Logging.logOnThrown(() =>  new ValidateReceiptsControllerImpl(
    new ValidateReceiptsValidatorImpl(
      new AppStoreImpl(
        AppStoreConfig(ssmConfig.config, ssmConfig.identity match {
          case awsIdentity: AwsIdentity => awsIdentity.stack
          case _ => "NO_STACK"
        })
      )
    )
  ), "Error initialising validate receipts controller")
  lazy val lambdaApiGateway: LambdaApiGateway = new LambdaApiGatewayImpl()

}

class ConfiguredValidateReceiptLambda extends ValidateReceiptLambda(
  ConfiguredValidateReceiptLambda.validateReceipts,
  ConfiguredValidateReceiptLambda.lambdaApiGateway)