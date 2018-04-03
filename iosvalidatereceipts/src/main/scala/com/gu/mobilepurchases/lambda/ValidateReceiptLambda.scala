package com.gu.mobilepurchases.lambda

import java.io.{InputStream, OutputStream}

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.gu.mobilepurchases.apple.{AppStoreConfig, AppStoreImpl}
import com.gu.mobilepurchases.config.SsmConfig
import com.gu.mobilepurchases.validate._

abstract class ValidateReceiptLambda(
                                      validateReceipts: ValidateReceiptsController,
                                      lambdaApiGateway: LambdaApiGateway
                                    ) extends RequestStreamHandler {
  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    lambdaApiGateway.execute(input, output, validateReceipts.validate)
  }
}

object ConfiguredValidateReceiptLambda {
  lazy val config = new SsmConfig().config
  lazy val validateReceipts: ValidateReceiptsController = new ValidateReceiptsControllerImpl(
    new ValidateReceiptsValidatorImpl(
      new AppStoreImpl(
        AppStoreConfig(config)
      )
    )
  )
  lazy val lambdaApiGateway: LambdaApiGateway = new LambdaApiGatewayImpl()

}

class ConfiguredValidateReceiptLambda extends ValidateReceiptLambda(
  ConfiguredValidateReceiptLambda.validateReceipts,
  ConfiguredValidateReceiptLambda.lambdaApiGateway)