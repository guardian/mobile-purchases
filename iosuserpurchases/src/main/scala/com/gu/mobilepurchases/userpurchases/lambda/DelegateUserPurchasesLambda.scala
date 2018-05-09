

package com.gu.mobilepurchases.userpurchases.lambda

import java.time.Clock

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.amazonaws.services.cloudwatch.{ AmazonCloudWatchAsync, AmazonCloudWatchAsyncClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient.defaultHttpClient
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodStatus
import com.gu.mobilepurchases.shared.lambda.{ AwsLambda, DelegateComparator, DelegateLambdaConfig, DelegatingLambda, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.lambda.DelegateUserPurchasesLambda.delegateIfConfigured
import com.gu.mobilepurchases.userpurchases.lambda.UserPurchasesLambda.userPurchasesName
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesResponse
import com.typesafe.config.{ Config, ConfigException }
import okhttp3.{ OkHttpClient, Request }
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
  private val logger = LogManager.getLogger(classOf[DelegateUserPurchasesLambdaComparator])
  private val diffMetricName: String = "purchases-diff"
  private val lambdaDiffMetricName: String = s"$diffMetricName-lambda"
  private val delegateDiffMetricName: String = s"$diffMetricName-delegate"
  private val returnedMetricName: String = "returned-purchases"

  override def apply(lambdaRequest: LambdaRequest, lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse = {
    (readPurchases(lambdaResponse), readPurchases(delegateResponse)) match {
      case (Some(lambdaUserPurchasesResponse), Some(delegateUserPurchasesResponse)) => {
        if (lambdaUserPurchasesResponse.equals(delegateUserPurchasesResponse)) {
          logDelegateExtras(0)
          logLambdaExtras(0)
          logReturnedQuantity(delegateUserPurchasesResponse.purchases.size)
          delegateResponse
        } else {
          val delegatePurchaseSet: Set[UserPurchase] = delegateUserPurchasesResponse.purchases
          val lambdaPurchaseSet: Set[UserPurchase] = lambdaUserPurchasesResponse.purchases

          val delegateExtraQuantity: Int = delegatePurchaseSet.diff(lambdaPurchaseSet).size
          val lambdaExtraQuantity: Int = lambdaPurchaseSet.diff(delegatePurchaseSet).size

          logDelegateExtras(delegateExtraQuantity)
          logLambdaExtras(lambdaExtraQuantity)

          if (delegatePurchaseSet.nonEmpty) {
            logReturnedQuantity(delegatePurchaseSet.size)
            delegateResponse
          } else {
            logger.warn(s"Missing Delegate purchases for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
            logReturnedQuantity(lambdaPurchaseSet.size)
            lambdaResponse
          }
        }
      }
      case (Some(userPurchasesResponse), _) => {
        logOnlyLambda(userPurchasesResponse)
        lambdaResponse
      }
      case (_, Some(userPurchasesResponse)) => {
        logOnlyDelegate(userPurchasesResponse)
        delegateResponse
      }
      case (_, _) => {
        logNothingReturned
        delegateResponse
      }
    }

  }

  override def logNothingReturned: Unit = {
    logLambdaExtras(0)
    logDelegateExtras(0)
    logReturnedQuantity(0)
  }

  private def logReturnedQuantity(quantity: Double): Boolean = {
    cloudWatch.queueMetric(returnedMetricName, quantity, StandardUnit.Count)
  }

  private def logDelegateExtras(delegateExtraQuantity: Int): Boolean = {
    cloudWatch.queueMetric(delegateDiffMetricName, delegateExtraQuantity, StandardUnit.Count)
  }

  private def logOnlyDelegate(delegatePurchasesQuantity: Double, extraDelegateTransactions: Double): Boolean = {
    logDelegateExtras(extraDelegateTransactions)
    cloudWatch.queueMetric(returnedMetricName, delegatePurchasesQuantity, StandardUnit.Count)
  }

  private def logDelegateExtras(extraDelegateTransactions: Double): Boolean = {
    cloudWatch.queueMetric(delegateDiffMetricName, extraDelegateTransactions, StandardUnit.Count)
  }

  def logOnlyLambda(userPurchasesResponse: UserPurchasesResponse): Boolean = {
    val size: Double = userPurchasesResponse.purchases.size
    logLambdaExtras(size)
    logDelegateExtras(0)
    logReturnedQuantity(size)
  }
  def logOnlyDelegate(userPurchasesResponse: UserPurchasesResponse): Boolean = {
    val size: Double = userPurchasesResponse.purchases.size
    logLambdaExtras(0)
    logDelegateExtras(size)
    logReturnedQuantity(size)
  }
  private def logLambdaExtras(extraLambdaTransactions: Double): Boolean = {
    cloudWatch.queueMetric(lambdaDiffMetricName, extraLambdaTransactions, StandardUnit.Count)
  }

  def readPurchases(response: LambdaResponse): Option[UserPurchasesResponse] = Try {
    if (goodStatus(response.statusCode)) {
      response.maybeBody.map(mapper.readValue[UserPurchasesResponse])
    } else {
      None
    }
  }.toOption.flatten

  override def logLambdaOnly(lambdaResponse: LambdaResponse): Unit = {
    readPurchases(lambdaResponse).map((userPurchasesResponse: UserPurchasesResponse) => {
      logOnlyLambda(userPurchasesResponse)
    }).getOrElse(logNothingReturned)
  }

  override def logDelegateOnly(lambdaResponse: LambdaResponse): Unit = {
    readPurchases(lambdaResponse).map((userPurchasesResponse: UserPurchasesResponse) => {
      logOnlyDelegate(userPurchasesResponse)
    }).getOrElse(logNothingReturned)
  }

}

object DelegateUserPurchasesLambda {

  def delegateIfConfigured(
    config: Config,
    userPurchasesController: UserPurchasesController,
    okHttpClient: OkHttpClient,
    cloudWatch: CloudWatch): (LambdaRequest => LambdaResponse) = {
    val logger: Logger = LogManager.getLogger(classOf[DelegateUserPurchasesLambda])
    Try {
      config.getString("delegate.insecureuserpurchasesurl")
    } match {
      case Success(url) => {
        logger.info(s"Delegating to $url")

        new DelegatingLambda(
          userPurchasesController,
          new DelegateUserPurchasesLambdaRequestMapper(url),
          new DelegateUserPurchasesLambdaComparator(cloudWatch),
          okHttpClient,
          cloudWatch,
          DelegateLambdaConfig(userPurchasesName)
        )
      }
      case Failure(_: ConfigException.Missing) => {
        logger.info(s"Not delegating")
        userPurchasesController
      }
      case Failure(t: Throwable) => {
        logger.info("Unexpected config error")
        throw t
      }
    }
  }
}

class DelegateUserPurchasesLambda(
    config: Config,
    userPurchasesController: UserPurchasesController,
    okHttpClient: OkHttpClient,

    cloudWatch: CloudWatch) extends AwsLambda(delegateIfConfigured(
  config,
  userPurchasesController,
  okHttpClient,
  cloudWatch), cloudWatch = cloudWatch) {
  def this(ssmConfig: SsmConfig, clock: Clock, cloudWatch: CloudWatch) = this(ssmConfig.config, UserPurchasesLambda.userPurchasesController(ssmConfig, clock, cloudWatch), defaultHttpClient, cloudWatch)

  def this(ssmConfig: SsmConfig, clock: Clock, amazonCloudWatch: AmazonCloudWatchAsync) = this(ssmConfig, clock, new CloudWatchImpl(ssmConfig.stage, userPurchasesName, amazonCloudWatch))

  def this() = this(SsmConfigLoader(), Clock.systemUTC(), AmazonCloudWatchAsyncClientBuilder.defaultClient())
}

