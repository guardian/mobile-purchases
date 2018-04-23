

package com.gu.mobilepurchases.userpurchases.lambda

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodResponse
import com.gu.mobilepurchases.shared.lambda.{ AwsLambda, DelegateComparator, DelegatingLambda, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.mobilepurchases.userpurchases.lambda.UserPurchasesLambda.userPurchasesName
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesResponse
import com.typesafe.config.ConfigException
import okhttp3.Request
import org.apache.http.NameValuePair
import org.apache.http.client.utils.URIBuilder
import org.apache.http.message.BasicNameValuePair
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.collection.JavaConverters._
import scala.util.{ Failure, Success, Try }

class DelegateUserPurchasesLambdaRequestMapper(delegateUserPurchasesUrl: String) extends (LambdaRequest => Request) {
  def apply(lambdaRequest: LambdaRequest): Request = new Request.Builder()
    .url(new URIBuilder(s"$delegateUserPurchasesUrl").addParameters(lambdaRequest.queryStringParameters.map {
      case (key, value) => new BasicNameValuePair(key, value).asInstanceOf[NameValuePair]
    }.toList.asJava).build().toURL)
    .get()
    .build()
}

object DelegateUserPurchasesLambda {

  def delegateIfConfigured(ssmConfig: SsmConfig): (LambdaRequest => LambdaResponse) = {
    val logger: Logger = LogManager.getLogger(classOf[DelegateUserPurchasesLambda])
    Try {
      ssmConfig.config.getString("delegate.userpurchasesurl")
    } match {
      case Success(url) => {
        logger.info(s"Delegating to $url")
        new DelegatingLambda(
          UserPurchasesLambda.userPurchasesController(ssmConfig),
          new DelegateUserPurchasesLambdaRequestMapper(url),
          (lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse) => {
            (goodResponse(lambdaResponse), goodResponse(delegateResponse)) match {
              case (true, true) => lambdaResponse.maybeBody.map((lambdaBody: String) =>
                mapper.readValue[UserPurchasesResponse](lambdaBody).purchases.headOption.map((_: UserPurchase) => lambdaResponse).getOrElse(delegateResponse)
              ).getOrElse(delegateResponse)
              case (true, false) => lambdaResponse
              case _             => delegateResponse
            }
          },
          GlobalOkHttpClient.defaultHttpClient
        )
      }
      case Failure(_: ConfigException.Missing) => {
        logger.info(s"Not delegating")
        UserPurchasesLambda.userPurchasesController(ssmConfig)
      }
      case Failure(t: Throwable) => {
        logger.info("Unexpected config error")
        throw t
      }
    }
  }
}

class DelegateUserPurchasesLambda(ssmConfig: SsmConfig, amazonCloudWatch: AmazonCloudWatch) extends AwsLambda(DelegateUserPurchasesLambda.delegateIfConfigured(ssmConfig), cloudWatch = new CloudWatchImpl(ssmConfig.stage, userPurchasesName, amazonCloudWatch)) {
  def this() = this(SsmConfigLoader(), AmazonCloudWatchClientBuilder.defaultClient())
}

