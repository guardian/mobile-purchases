package com.gu.mobilepurchases.lambda

import java.net.URI

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.config.SsmConfig
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodResponse
import com.gu.mobilepurchases.shared.lambda.{ AwsLambda, DelegateComparator, DelegatingLambda, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.validate.{ ValidateReceiptsController, ValidateResponse }
import com.typesafe.config.{ Config, ConfigException }
import okhttp3.{ OkHttpClient, Request, RequestBody }
import org.apache.http.NameValuePair
import org.apache.http.client.utils.URIBuilder
import org.apache.http.message.BasicNameValuePair
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.collection.JavaConverters._
import scala.util.{ Failure, Success, Try }

class DelegatingValidateReceiptLambdaRequestMapper(delegateValidateUrl: String) extends (LambdaRequest => Request) {
  def apply(lambdaRequest: LambdaRequest): Request = {
    val uri: URI = new URIBuilder(delegateValidateUrl).addParameters(lambdaRequest.queryStringParameters.map {
      case (key, value) => new BasicNameValuePair(key, value).asInstanceOf[NameValuePair]
    }.toList.asJava).build()

    new Request.Builder().url(uri.toURL).post(RequestBody.create(
      GlobalOkHttpClient.applicationJsonMediaType, lambdaRequest.maybeBody.getOrElse(throw new IllegalStateException("Missing body")))).build()
  }
}

object DelegatingValidateReceiptLambda {
  val logger: Logger = LogManager.getLogger(classOf[DelegatingValidateReceiptLambda])

  def delegateIfConfigured(config: Config, validateReceiptsController: ValidateReceiptsController, client: OkHttpClient): (LambdaRequest => LambdaResponse) = {
    Try(config.getString("delegate.validatereceiptsurl")) match {
      case Success(delegateUrl) => {
        logger.info(s"Delegating to $delegateUrl")
        new DelegatingLambda(
          validateReceiptsController,
          new DelegatingValidateReceiptLambdaRequestMapper(delegateUrl),
          (lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse) => (goodResponse(lambdaResponse), goodResponse(delegateResponse)) match {
            case (true, true) => lambdaResponse.maybeBody.map((lambdaBody: String) =>
              mapper.readValue[ValidateResponse](lambdaBody).transactions.headOption.map((_: ValidatedTransaction) => lambdaResponse).getOrElse(delegateResponse)
            ).getOrElse(delegateResponse)
            case (true, false) => lambdaResponse
            case _             => delegateResponse
          },

          httpClient = client
        )
      }
      case Failure(_: ConfigException.Missing) => {
        logger.info("Not delegating")
        validateReceiptsController
      }
      case Failure(t: Throwable) => {
        logger.info("Unexpected config error")
        throw t
      }
    }
  }

}

class DelegatingValidateReceiptLambda(
    config: Config,
    controller: ValidateReceiptsController,
    client: OkHttpClient
) extends AwsLambda(DelegatingValidateReceiptLambda.delegateIfConfigured(config, controller, client)) {
  def this(ssmConfig: SsmConfig, client: OkHttpClient) {
    this(ssmConfig.config, ValidateReceiptLambda.validateReceipts(ssmConfig, client), client)
  }

  def this() {
    this(new SsmConfig, GlobalOkHttpClient.defaultHttpClient)
  }

}
