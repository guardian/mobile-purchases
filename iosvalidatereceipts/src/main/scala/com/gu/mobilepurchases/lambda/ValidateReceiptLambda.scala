package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.gu.mobilepurchases.apple.{AppStoreConfig, AppStoreImpl}
import com.gu.mobilepurchases.config.SsmConfig
import com.gu.mobilepurchases.validate._
import com.gu.{AwsIdentity, DevIdentity}

abstract class ValidateReceiptLambda(
                                      validateReceipts: ValidateReceiptsController,
                                      lambdaApiGateway: LambdaApiGateway
                                    ) extends RequestStreamHandler {
  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    lambdaApiGateway.execute(input, output, validateReceipts.validate)
  }
}

object ConfiguredValidateReceiptLambda {
  lazy val ssmConfig = new SsmConfig()
  lazy val validateReceipts: ValidateReceiptsController = new ValidateReceiptsControllerImpl(
    new ValidateReceiptsValidatorImpl(
      new AppStoreImpl(
        AppStoreConfig(ssmConfig.config, ssmConfig.identity match {
          case x: AwsIdentity => x.stack
          case _ => "NO_STACK"
        })
      )
    )
  )
  lazy val lambdaApiGateway: LambdaApiGateway = new LambdaApiGatewayImpl()

}

class ConfiguredValidateReceiptLambda extends ValidateReceiptLambda(
  ConfiguredValidateReceiptLambda.validateReceipts,
  ConfiguredValidateReceiptLambda.lambdaApiGateway)