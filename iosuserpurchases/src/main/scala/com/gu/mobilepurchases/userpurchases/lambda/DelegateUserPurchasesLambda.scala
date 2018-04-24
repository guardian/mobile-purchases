

package com.gu.mobilepurchases.userpurchases.lambda

import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl}
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodStatus
import com.gu.mobilepurchases.shared.lambda.{ AwsLambda, DelegateComparator, DelegateLambdaConfig, DelegatingLambda, LambdaRequest, LambdaResponse }
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

class DelegateUserPurchasesLambdaComparator(cloudWatch: CloudWatch) extends DelegateComparator {
  override def apply(lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse = {
    val diffMetricName: String = "purchases-diff"
    (readPurhcases(lambdaResponse), readPurhcases(delegateResponse)) match {
      case (Some(lambdaUserPurchasesResponse), Some(delegateUserPurchasesResponse)) => {
        val difference = lambdaUserPurchasesResponse.purchases.size - delegateUserPurchasesResponse.purchases.size
        cloudWatch.queueMetric(diffMetricName, difference)
        if (difference >= 0) {
          lambdaResponse
        } else {
          delegateResponse
        }
      }
      case (Some(userPurchasesResponse), _) => {
        cloudWatch.queueMetric(diffMetricName, userPurchasesResponse.purchases.size)
        lambdaResponse
      }
      case (_, Some(userPurchasesResponse)) => {
        cloudWatch.queueMetric(diffMetricName, 0 - userPurchasesResponse.purchases.size)
        delegateResponse
      }
      case (_, _) => delegateResponse
    }

  }

  def readPurhcases(response: LambdaResponse): Option[UserPurchasesResponse] = Try {
    if (goodStatus(response.statusCode)) {
      response.maybeBody.map(mapper.readValue[UserPurchasesResponse])
    } else {
      None
    }
  }.toOption.flatten
}

object DelegateUserPurchasesLambda {

  def delegateIfConfigured(ssmConfig: SsmConfig, cloudWatch: CloudWatch): (LambdaRequest => LambdaResponse) = {
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
            (goodStatus(lambdaResponse.statusCode), goodStatus(delegateResponse.statusCode)) match {
              case (true, true) => lambdaResponse.maybeBody.map((lambdaBody: String) =>
                mapper.readValue[UserPurchasesResponse](lambdaBody).purchases.headOption.map((_: UserPurchase) => lambdaResponse).getOrElse(delegateResponse)
              ).getOrElse(delegateResponse)
              case (true, false) => lambdaResponse
              case _             => delegateResponse
            }
          },
          GlobalOkHttpClient.defaultHttpClient,
          cloudWatch,
          DelegateLambdaConfig(userPurchasesName)
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

class DelegateUserPurchasesLambda(ssmConfig: SsmConfig, cloudWatch: CloudWatch) extends AwsLambda(DelegateUserPurchasesLambda.delegateIfConfigured(ssmConfig, cloudWatch), cloudWatch = cloudWatch) {
  def this(ssmConfig: SsmConfig, amazonCloudWatch: AmazonCloudWatch) = this(ssmConfig, new CloudWatchImpl(ssmConfig.stage, userPurchasesName, amazonCloudWatch))
  def this() = this(SsmConfigLoader(), AmazonCloudWatchClientBuilder.defaultClient())
}

