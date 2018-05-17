

package com.gu.mobilepurchases.userpurchases.lambda

import java.time.{ Clock, ZonedDateTime }

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.amazonaws.services.cloudwatch.{ AmazonCloudWatchAsync, AmazonCloudWatchAsyncClientBuilder }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl }
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient.defaultHttpClient
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodStatus
import com.gu.mobilepurchases.shared.lambda.{ AwsLambda, DelegateComparator, DelegateLambdaConfig, DelegatingLambda, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.lambda.DelegateUserPurchasesLambda.delegateIfConfigured
import com.gu.mobilepurchases.userpurchases.lambda.UserPurchasesLambda.userPurchasesName
import com.gu.mobilepurchases.userpurchases.persistence.UserPurchaseConfig
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesResponse
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
          latestMatched
          delegateResponse
        } else {

          val delegatePurchaseSet: Set[UserPurchase] = delegateUserPurchasesResponse.purchases

          val lambdaPurchaseSet: Set[UserPurchase] = lambdaUserPurchasesResponse.purchases
          val delegateExtraQuantity: Int = delegatePurchaseSet.diff(lambdaPurchaseSet).size

          val lambdaExtraQuantity: Int = lambdaPurchaseSet.diff(delegatePurchaseSet).size

          compareLatestPurchases(lambdaRequest, lambdaPurchaseSet, delegatePurchaseSet)

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
      case (Some(lambdaUserPurchaseResponse), _) => {
        logOnlyLambda(lambdaUserPurchaseResponse)
        compareLatestPurchases(lambdaRequest,lambdaUserPurchaseResponse.purchases, Set())
        lambdaResponse
      }
      case (_, Some(delegateUserPurchasesResponse)) => {
        logOnlyDelegate(delegateUserPurchasesResponse)
        compareLatestPurchases(lambdaRequest,Set(), delegateUserPurchasesResponse.purchases)
        delegateResponse
      }
      case (_, _) => {
        logNothingReturned
        delegateResponse
      }
    }

  }
  def latestMatched: Unit = {
    cloudWatch.queueMetric("latest-matched", 1, StandardUnit.Count)
  }

  private def compareLatestPurchases(request: LambdaRequest, lambdaPurchaseSet: Set[UserPurchase],delegatePurchaseSet: Set[UserPurchase], ): Unit = {
    val now: String = ZonedDateTime.now.format(UserPurchase.instantFormatter)
    def latestLambdaNewerThanDelegate: Unit = {
      cloudWatch.queueMetric("lambda-newer-than-delegate", 1, StandardUnit.Count)
      logger.warn("Lambda Newer Than Delegate: Request: {}, Lambda:\n {} Delegate\n: {}", request: Any, lambdaPurchaseSet: Any, delegatePurchaseSet: Any)
    }

    def latestDelegateNewerThanLambda: Unit = {
      cloudWatch.queueMetric("delegate-newer-than-lambda", 1, StandardUnit.Count)
      logger.warn("Delegate Newer Than Lambda: Request: {}. Delegate:\n {} Lambda\n: {}", request: Any, delegatePurchaseSet: Any, lambdaPurchaseSet: Any)
    }

    def latestExpiryDate(purchases: Set[UserPurchase]): Option[String] = {
      purchases.toSeq.filter(_.activeInterval.end > now).sortBy(_.activeInterval.end).lastOption.map(_.activeInterval.end)
    }

    (latestExpiryDate(lambdaPurchaseSet), latestExpiryDate(delegatePurchaseSet)) match {
      case (Some(lambda), Some(delegate)) => {
        if (delegate > lambda) {
          latestDelegateNewerThanLambda
        } else if (lambda > delegate) {
          latestLambdaNewerThanDelegate
        }
        else {
          latestMatched
        }
      }
      case (Some(_), None) => latestLambdaNewerThanDelegate
      case (None, Some(_)) => latestDelegateNewerThanLambda
      case (None, None) => latestMatched
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
    url: String,
    userPurchasesController: UserPurchasesController,
    okHttpClient: OkHttpClient,
    cloudWatch: CloudWatch): (LambdaRequest => LambdaResponse) = {
    val logger: Logger = LogManager.getLogger(classOf[DelegateUserPurchasesLambda])

    new DelegatingLambda(
      userPurchasesController,
      new DelegateUserPurchasesLambdaRequestMapper(url),
      new DelegateUserPurchasesLambdaComparator(cloudWatch),
      okHttpClient,
      cloudWatch,
      DelegateLambdaConfig(userPurchasesName)
    )
  }
}

class DelegateUserPurchasesLambda(
    delegateUrl: String,
    userPurchasesController: UserPurchasesController,
    okHttpClient: OkHttpClient,

    cloudWatch: CloudWatch) extends AwsLambda(delegateIfConfigured(
  delegateUrl,
  userPurchasesController,
  okHttpClient,
  cloudWatch), cloudWatch = cloudWatch) {
  def this(delegateUrl: String, userPurchaseConfig: UserPurchaseConfig, clock: Clock, cloudWatch: CloudWatch) = this(delegateUrl, UserPurchasesLambda.userPurchasesController(userPurchaseConfig, clock, cloudWatch), defaultHttpClient, cloudWatch)

  def this(delegateUrl: String, userPurchaseConfig: UserPurchaseConfig, clock: Clock, amazonCloudWatch: AmazonCloudWatchAsync) = this(delegateUrl, userPurchaseConfig, clock, new CloudWatchImpl(userPurchaseConfig.stage, userPurchasesName, amazonCloudWatch))

  def this() = this(Try {
    val insecureuserpurchasesurl: String = System.getenv("insecureuserpurchasesurl")
    Option(insecureuserpurchasesurl).filter(_.nonEmpty).get

  } match {
    case Success(success) => {
      LogManager.getLogger(classOf[DelegateUserPurchasesLambda]).info(s"Delegating to $success")
      success
    }
    case Failure(t: Throwable) => {
      LogManager.getLogger(classOf[DelegateUserPurchasesLambda]).info("Unexpected config error")
      throw t
    }
  }, UserPurchasesLambda.fetchUserPurchaseConfig, Clock.systemUTC(), AmazonCloudWatchAsyncClientBuilder.defaultClient())
}

