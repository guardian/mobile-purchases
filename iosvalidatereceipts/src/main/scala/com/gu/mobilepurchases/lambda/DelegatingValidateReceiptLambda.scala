package com.gu.mobilepurchases.lambda

import java.net.URI
import java.time.Clock
import java.util.concurrent.TimeUnit

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.amazonaws.services.cloudwatch.{ AmazonCloudWatchAsync, AmazonCloudWatchAsyncClientBuilder }
import com.gu.mobilepurchases.lambda.ValidateReceiptLambda.validateReceiptsName
import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchImpl }
import com.gu.mobilepurchases.shared.config.{ SsmConfig, SsmConfigLoader }
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient.defaultHttpClient
import com.gu.mobilepurchases.shared.external.Jackson._
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodStatus
import com.gu.mobilepurchases.shared.lambda.{ AwsLambda, DelegateComparator, DelegateLambdaConfig, DelegatingLambda, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.validate.{ ValidateReceiptsController, ValidateResponse }
import com.typesafe.config.{ Config, ConfigException }
import okhttp3.{ OkHttpClient, Request, RequestBody }
import org.apache.http.NameValuePair
import org.apache.http.client.utils.URIBuilder
import org.apache.http.message.BasicNameValuePair
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
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

class DelegatingValidateReceiptCompators(cloudWatch: CloudWatch) extends DelegateComparator {
  private val logger = LogManager.getLogger(classOf[DelegatingValidateReceiptCompators])
  private val diffMetricName: String = "transactions-diff"
  private val lambdaDiffMetricName: String = s"$diffMetricName-lambda"
  private val delegateDiffMetricsName: String = s"$diffMetricName-delegate"

  override def apply(lambdaRequest: LambdaRequest, lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse = {
    val maybeDelegateResponse: Option[ValidateResponse] = readValidateResponse(delegateResponse)
    (readValidateResponse(lambdaResponse), maybeDelegateResponse) match {
      case (Some(lambdaValidateResponse), Some(delegateValidateResponse)) => {
        if (lambdaValidateResponse.equals(delegateValidateResponse)) {
          cloudWatch.queueMetric(lambdaDiffMetricName, 0, StandardUnit.Count)
          cloudWatch.queueMetric(delegateDiffMetricsName, 0, StandardUnit.Count)
          delegateResponse
        } else {
          val lambdaTransactions: Set[ValidatedTransaction] = lambdaValidateResponse.transactions
          val delegateTransactions: Set[ValidatedTransaction] = delegateValidateResponse.transactions
          if (lambdaTransactions.size != delegateTransactions.size) {
            logger.warn(s"Validate size mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
          }
          val lambdaExtraQuantity: Int = lambdaTransactions.diff(delegateTransactions).size
          val delegateExtraQuantity: Int = delegateTransactions.diff(lambdaTransactions).size
          cloudWatch.queueMetric(lambdaDiffMetricName, lambdaExtraQuantity, StandardUnit.Count)
          cloudWatch.queueMetric(delegateDiffMetricsName, delegateExtraQuantity, StandardUnit.Count)
          if (delegateTransactions.nonEmpty) {
            delegateResponse
          } else {
            lambdaResponse
          }
        }

      }
      case (Some(validateResponse), _) => {
        logger.warn(s"Validate mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
        cloudWatch.queueMetric(lambdaDiffMetricName, validateResponse.transactions.size, StandardUnit.Count)
        lambdaResponse
      }
      case (_, Some(validateResponse)) => {
        logger.warn(s"Validate mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
        cloudWatch.queueMetric(delegateDiffMetricsName, validateResponse.transactions.size, StandardUnit.Count)
        delegateResponse
      }
      case (_, _) => delegateResponse
    }

  }

  def readValidateResponse(response: LambdaResponse): Option[ValidateResponse] = {
    Try {
      if (goodStatus(response.statusCode)) {
        response.maybeBody.map(mapper.readValue[ValidateResponse])
      } else {
        None
      }
    }.toOption.flatten
  }

}

object DelegatingValidateReceiptLambda {

  def delegateIfConfigured(
    config: Config,
    validateReceiptsController: ValidateReceiptsController,
    okHttpClient: OkHttpClient,
    cloudWatch: CloudWatch): (LambdaRequest => LambdaResponse) = {
    val logger: Logger = LogManager.getLogger(classOf[DelegatingValidateReceiptLambda])
    Try(config.getString("delegate.validatereceiptsurl")) match {
      case Success(delegateUrl) => {
        logger.info(s"Delegating to $delegateUrl")
        new DelegatingLambda(
          validateReceiptsController,
          new DelegatingValidateReceiptLambdaRequestMapper(delegateUrl),
          new DelegatingValidateReceiptCompators(cloudWatch),
          okHttpClient, cloudWatch, DelegateLambdaConfig(validateReceiptsName)
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
    client: OkHttpClient,
    cloudWatch: CloudWatch

) extends AwsLambda(DelegatingValidateReceiptLambda.delegateIfConfigured(config, controller, client, cloudWatch), cloudWatch = cloudWatch) {
  def this(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatch, clock: Clock, lamdaTimeout: Duration) = this(
    ssmConfig.config,
    ValidateReceiptLambda.validateReceipts(ssmConfig, client, cloudWatch, clock, lamdaTimeout),
    client, cloudWatch
  )

  def this(ssmConfig: SsmConfig, amazonCloudWatch: AmazonCloudWatchAsync, clock: Clock, lambdaTimeout: Duration) = this(ssmConfig, defaultHttpClient, new CloudWatchImpl(ssmConfig.stage, validateReceiptsName, amazonCloudWatch), clock, lambdaTimeout)

  def this() {
    this(SsmConfigLoader(), AmazonCloudWatchAsyncClientBuilder.defaultClient(), Clock.systemUTC(), Duration(240, TimeUnit.SECONDS))
  }

}
