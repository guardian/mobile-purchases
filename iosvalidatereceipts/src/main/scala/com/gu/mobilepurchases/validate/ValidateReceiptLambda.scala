package com.gu.mobilepurchases.validate

import java.io.{InputStream, OutputStream}

import com.amazonaws.services.lambda.runtime.{Context, RequestStreamHandler}
import com.gu.mobilepurchases.apple.{AppStoreConfig, AppStoreImpl, Invalid}
import com.gu.mobilepurchases.lambda.{LambdaApiGateway, LambdaApiGatewayImpl}

abstract class ValidateReceiptLambda(
                                      validateReceipts: ValidateReceiptsController,
                                      lambdaApiGateway: LambdaApiGateway
                                    ) extends RequestStreamHandler {
  override def handleRequest(input: InputStream, output: OutputStream, context: Context): Unit = {
    lambdaApiGateway.execute(input, output, validateReceipts.validate)
  }
}

object ConfiguredValidateReceiptLambda {
  lazy val validateReceipts: ValidateReceiptsController = new ValidateReceiptsControllerImpl(
    new ValidateReceiptsValidatorImpl(
      new AppStoreImpl(
        AppStoreConfig("password", Invalid)
      )
    )
  )
  lazy val lambdaApiGateway: LambdaApiGateway = new LambdaApiGatewayImpl()

}

class ConfiguredValidateReceiptLambda extends ValidateReceiptLambda(
  ConfiguredValidateReceiptLambda.validateReceipts,
  ConfiguredValidateReceiptLambda.lambdaApiGateway)