

package com.gu.mobilepurchases.userpurchases.lambda

import java.time.Clock

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl }
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
    val returnedMetricName: String = "returned-purchases"
    (readPurchases(lambdaResponse), readPurchases(delegateResponse)) match {
      case (Some(lambdaUserPurchasesResponse), Some(delegateUserPurchasesResponse)) => {
        val delegatePurchaseSize: Double = delegateUserPurchasesResponse.purchases.size
        val lambdaPurchaseSize: Double = lambdaUserPurchasesResponse.purchases.size
        val difference = lambdaPurchaseSize - delegatePurchaseSize
        cloudWatch.queueMetric(diffMetricName, difference, StandardUnit.Count)
        if (difference >= 0) {
          cloudWatch.queueMetric(returnedMetricName, lambdaPurchaseSize, StandardUnit.Count)
          lambdaResponse
        } else {
          cloudWatch.queueMetric(returnedMetricName, delegatePurchaseSize, StandardUnit.Count)
          delegateResponse
        }
      }
      case (Some(userPurchasesResponse), _) => {
        val lambdaPurchaseSize: Double = userPurchasesResponse.purchases.size
        cloudWatch.queueMetric(diffMetricName, lambdaPurchaseSize, StandardUnit.Count)
        cloudWatch.queueMetric(returnedMetricName, lambdaPurchaseSize, StandardUnit.Count)
        lambdaResponse
      }
      case (_, Some(userPurchasesResponse)) => {
        val delegatePurchaseSize: Double = userPurchasesResponse.purchases.size
        cloudWatch.queueMetric(diffMetricName, 0 - delegatePurchaseSize, StandardUnit.Count)
        cloudWatch.queueMetric(returnedMetricName, delegatePurchaseSize, StandardUnit.Count)
        delegateResponse
      }
      case (_, _) => delegateResponse
    }

  }

  def readPurchases(response: LambdaResponse): Option[UserPurchasesResponse] = Try {
    if (goodStatus(response.statusCode)) {
      response.maybeBody.map(mapper.readValue[UserPurchasesResponse])
    } else {
      None
    }
  }.toOption.flatten
}

object DelegateUserPurchasesLambda {

  def delegateIfConfigured(ssmConfig: SsmConfig, clock: Clock, cloudWatch: CloudWatch): (LambdaRequest => LambdaResponse) = {
    val logger: Logger = LogManager.getLogger(classOf[DelegateUserPurchasesLambda])
    Try {
      ssmConfig.config.getString("delegate.userpurchasesurl")
    } match {
      case Success(url) => {
        logger.info(s"Delegating to $url")
        new DelegatingLambda(
          UserPurchasesLambda.userPurchasesController(ssmConfig, clock),
          new DelegateUserPurchasesLambdaRequestMapper(url),
          new DelegateUserPurchasesLambdaComparator(cloudWatch),
          GlobalOkHttpClient.defaultHttpClient,
          cloudWatch,
          DelegateLambdaConfig(userPurchasesName)
        )
      }
      case Failure(_: ConfigException.Missing) => {
        logger.info(s"Not delegating")
        UserPurchasesLambda.userPurchasesController(ssmConfig, clock)
      }
      case Failure(t: Throwable) => {
        logger.info("Unexpected config error")
        throw t
      }
    }
  }
}

class DelegateUserPurchasesLambda(ssmConfig: SsmConfig, clock: Clock, cloudWatch: CloudWatch) extends AwsLambda(DelegateUserPurchasesLambda.delegateIfConfigured(ssmConfig, clock, cloudWatch), cloudWatch = cloudWatch) {
  def this(ssmConfig: SsmConfig, clock: Clock, amazonCloudWatch: AmazonCloudWatch) = this(ssmConfig, clock, new CloudWatchImpl(ssmConfig.stage, userPurchasesName, amazonCloudWatch))
  def this() = this(SsmConfigLoader(), Clock.systemUTC(), AmazonCloudWatchClientBuilder.defaultClient())
}

