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
  private val returnedTransactions: String = "returned-transactions"

  override def apply(lambdaRequest: LambdaRequest, lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse = {
    val maybeDelegateResponse: Option[ValidateResponse] = readValidateResponse(delegateResponse)
    (readValidateResponse(lambdaResponse), maybeDelegateResponse) match {
      case (Some(lambdaValidateResponse), Some(delegateValidateResponse)) => {
        if (lambdaValidateResponse.equals(delegateValidateResponse)) {
          logLambdaExtras(0)
          logDelegateExtras(0)
          logReturnedTransactions(0)
          delegateResponse
        } else {
          val lambdaTransactions: Set[ValidatedTransaction] = lambdaValidateResponse.transactions
          val delegateTransactions: Set[ValidatedTransaction] = delegateValidateResponse.transactions
          if (lambdaTransactions.size != delegateTransactions.size) {
            logger.warn(s"Validate size mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
          }
          val lambdaExtraQuantity: Int = lambdaTransactions.diff(delegateTransactions).size
          val delegateExtraQuantity: Int = delegateTransactions.diff(lambdaTransactions).size
          logLambdaExtras(lambdaExtraQuantity)
          logDelegateExtras(delegateExtraQuantity)
          if (delegateTransactions.nonEmpty) {
            logReturnedTransactions(delegateTransactions.size)
            delegateResponse
          } else {
            logReturnedTransactions(lambdaTransactions.size)
            lambdaResponse
          }
        }

      }
      case (Some(validateResponse), _) => {
        logger.warn(s"Validate mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
        logDelegateOnly(validateResponse)
        lambdaResponse
      }
      case (_, Some(validateResponse)) => {
        logger.warn(s"Validate mismatch for Request: $lambdaRequest \nLambda Response: $lambdaResponse \nDelegate Response: $delegateResponse")
        logLambdaOnly(validateResponse)
        delegateResponse
      }
      case (_, _) => {
        logNothingReturned
        delegateResponse
      }
    }

  }

  private def logDelegateOnly(validateResponse: ValidateResponse): Boolean = {
    logDelegateExtras(0)
    logLambdaExtras(validateResponse.transactions.size)
  }

  private def logLambdaOnly(validateResponse: ValidateResponse): Boolean = {
    logLambdaExtras(0)
    logDelegateExtras(validateResponse.transactions.size)
  }

  override def logNothingReturned: Unit = {
    logReturnedTransactions(0)
    logDelegateExtras(0)
    logLambdaExtras(0)
  }

  private def logLambdaExtras(quantity: Double): Boolean = {
    cloudWatch.queueMetric(lambdaDiffMetricName, quantity, StandardUnit.Count)
  }

  private def logReturnedTransactions(quantity: Double): Boolean = {
    cloudWatch.queueMetric(returnedTransactions, quantity, StandardUnit.Count)
  }

  private def logDelegateExtras(quantity: Double): Boolean = {
    cloudWatch.queueMetric(delegateDiffMetricsName, quantity, StandardUnit.Count)
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

  override def logLambdaOnly(lambdaResponse: LambdaResponse): Unit = {
    readValidateResponse(lambdaResponse).map(lambdaValidateResponse => {
      logLambdaOnly(lambdaValidateResponse)
    }).getOrElse(logNothingReturned)
  }

  override def logDelegateOnly(deleateResponse: LambdaResponse): Unit = {
    readValidateResponse(deleateResponse).map(deleateValidateResponse => {
      logDelegateOnly(deleateValidateResponse)
    }).getOrElse(logNothingReturned)
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

  lazy val ssmConfig = SsmConfigLoader()
  lazy val cloudwatch: CloudWatchImpl = {
    val amazonCloudWatch: AmazonCloudWatchAsync = AmazonCloudWatchAsyncClientBuilder.defaultClient()
    new CloudWatchImpl(ssmConfig.stage, validateReceiptsName, amazonCloudWatch)
  }
  lazy val lambda: (LambdaRequest => LambdaResponse) = delegateIfConfigured(ssmConfig.config, ValidateReceiptLambda.validateReceipts(ssmConfig, defaultHttpClient, cloudwatch, Clock.systemUTC(), Duration(240, TimeUnit.SECONDS)), defaultHttpClient, cloudwatch)

}

class DelegatingValidateReceiptLambda(
    lambda: (LambdaRequest => LambdaResponse),
    cloudWatch: CloudWatch
) extends AwsLambda(lambda, cloudWatch = cloudWatch) {
  def this(
    config: Config,
    controller: ValidateReceiptsController,
    client: OkHttpClient,
    cloudWatch: CloudWatch) = this(DelegatingValidateReceiptLambda.delegateIfConfigured(config, controller, client, cloudWatch), cloudWatch)

  def this(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatch, clock: Clock, lamdaTimeout: Duration) = this(
    ssmConfig.config,
    ValidateReceiptLambda.validateReceipts(ssmConfig, client, cloudWatch, clock, lamdaTimeout),
    client, cloudWatch
  )

  def this() {
    this(DelegatingValidateReceiptLambda.lambda, DelegatingValidateReceiptLambda.cloudwatch)

  }

}
