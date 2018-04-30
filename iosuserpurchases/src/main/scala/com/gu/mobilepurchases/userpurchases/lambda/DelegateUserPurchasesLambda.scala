

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
  private val logger = LogManager.getLogger(classOf[DelegateUserPurchasesLambdaComparator])
  private val diffMetricName: String = "purchases-diff"
  private val lambdaDiffMetricName: String = s"$diffMetricName-lambda"
  private val delegateDiffMetricName: String = s"$diffMetricName-delegate"
  private val returnedMetricName: String = "returned-purchases"
  override def apply(lambdaRequest: LambdaRequest, lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse = {
    (readPurchases(lambdaResponse), readPurchases(delegateResponse)) match {
      case (Some(lambdaUserPurchasesResponse), Some(delegateUserPurchasesResponse)) => {
        if (lambdaUserPurchasesResponse.equals(delegateUserPurchasesResponse)) {
          cloudWatch.queueMetric(lambdaDiffMetricName, 0, StandardUnit.Count)
          cloudWatch.queueMetric(delegateDiffMetricName, 0, StandardUnit.Count)
          cloudWatch.queueMetric(returnedMetricName, lambdaUserPurchasesResponse.purchases.size, StandardUnit.Count)
          lambdaResponse
        } else {
          logger.warn(s"Purchases mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
          val delegatePurchaseSet: Set[UserPurchase] = delegateUserPurchasesResponse.purchases
          val lambdaPurchaseSet: Set[UserPurchase] = lambdaUserPurchasesResponse.purchases
          val lambdaExtraQuantity: Int = lambdaPurchaseSet.diff(delegatePurchaseSet).size
          val delegateExtraQuantity: Int = lambdaPurchaseSet.diff(lambdaPurchaseSet).size
          cloudWatch.queueMetric(lambdaDiffMetricName, lambdaExtraQuantity, StandardUnit.Count)
          cloudWatch.queueMetric(delegateDiffMetricName, delegateExtraQuantity, StandardUnit.Count)
          if (lambdaExtraQuantity >= delegateExtraQuantity) {
            cloudWatch.queueMetric(returnedMetricName, lambdaPurchaseSet.size, StandardUnit.Count)
            lambdaResponse
          } else {
            cloudWatch.queueMetric(returnedMetricName, delegatePurchaseSet.size, StandardUnit.Count)
            delegateResponse
          }
        }
      }
      case (Some(userPurchasesResponse), _) => {
        val lambdaPurchasesQuantity: Double = userPurchasesResponse.purchases.size
        cloudWatch.queueMetric(lambdaDiffMetricName, lambdaPurchasesQuantity, StandardUnit.Count)
        cloudWatch.queueMetric(returnedMetricName, lambdaPurchasesQuantity, StandardUnit.Count)
        lambdaResponse
      }
      case (_, Some(userPurchasesResponse)) => {
        val delegatePurchasesQuantity: Double = userPurchasesResponse.purchases.size
        cloudWatch.queueMetric(delegateDiffMetricName, delegatePurchasesQuantity, StandardUnit.Count)
        cloudWatch.queueMetric(returnedMetricName, delegatePurchasesQuantity, StandardUnit.Count)
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
          UserPurchasesLambda.userPurchasesController(ssmConfig, clock, cloudWatch),
          new DelegateUserPurchasesLambdaRequestMapper(url),
          new DelegateUserPurchasesLambdaComparator(cloudWatch),
          GlobalOkHttpClient.defaultHttpClient,
          cloudWatch,
          DelegateLambdaConfig(userPurchasesName)
        )
      }
      case Failure(_: ConfigException.Missing) => {
        logger.info(s"Not delegating")
        UserPurchasesLambda.userPurchasesController(ssmConfig, clock, cloudWatch)
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

