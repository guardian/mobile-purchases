package com.gu.mobilepurchases.lambda

import java.net.URI
import java.time.Clock
import java.util.concurrent.TimeUnit

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.amazonaws.services.cloudwatch.{AmazonCloudWatch, AmazonCloudWatchClientBuilder}
import com.gu.mobilepurchases.lambda.ValidateReceiptLambda.validateReceiptsName
import com.gu.mobilepurchases.shared.cloudwatch.{CloudWatch, CloudWatchImpl}
import com.gu.mobilepurchases.shared.config.{SsmConfig, SsmConfigLoader}
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient.defaultHttpClient
import com.gu.mobilepurchases.shared.external.Jackson._
import com.gu.mobilepurchases.shared.lambda.DelegatingLambda.goodStatus
import com.gu.mobilepurchases.shared.lambda.{AwsLambda, DelegateComparator, DelegateLambdaConfig, DelegatingLambda, LambdaRequest, LambdaResponse}
import com.gu.mobilepurchases.validate.{ValidateReceiptsController, ValidateResponse}
import com.typesafe.config.{Config, ConfigException}
import okhttp3.{OkHttpClient, Request, RequestBody}
import org.apache.http.NameValuePair
import org.apache.http.client.utils.URIBuilder
import org.apache.http.message.BasicNameValuePair
import org.apache.logging.log4j.{LogManager, Logger}

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.util.{Failure, Success, Try}

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
  override def apply(lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse = {
    val diffMetricName: String = "transactions-diff"
    (readTransactions(lambdaResponse), readTransactions(delegateResponse)) match {
      case (Some(lambdaTransactions), Some(delegateTransactions)) => {
        val difference = lambdaTransactions.transactions.size - delegateTransactions.transactions.size
        cloudWatch.queueMetric(diffMetricName, difference, StandardUnit.Count)
        if (difference >= 0) {
          lambdaResponse
        } else {
          delegateResponse
        }
      }
      case (Some(lambdaTransactions), _) => {
        cloudWatch.queueMetric(diffMetricName, lambdaTransactions.transactions.size, StandardUnit.Count)
        lambdaResponse
      }
      case (_, Some(lambdaTransactions)) => {
        cloudWatch.queueMetric(diffMetricName, 0 - lambdaTransactions.transactions.size, StandardUnit.Count)
        delegateResponse
      }
      case (_, _) => delegateResponse
    }

  }

  def readTransactions(response: LambdaResponse): Option[ValidateResponse] = {
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
                            client: OkHttpClient,
                            cloudWatch: CloudWatch): (LambdaRequest => LambdaResponse) = {
    val logger: Logger = LogManager.getLogger(classOf[DelegatingValidateReceiptLambda])
    Try(config.getString("delegate.validatereceiptsurl")) match {
      case Success(delegateUrl) => {
        logger.info(s"Delegating to $delegateUrl")
        new DelegatingLambda(
          validateReceiptsController,
          new DelegatingValidateReceiptLambdaRequestMapper(delegateUrl),
          new DelegatingValidateReceiptCompators(cloudWatch),
          httpClient = client, cloudWatch, DelegateLambdaConfig(validateReceiptsName)
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
  def this(ssmConfig: SsmConfig, client: OkHttpClient, cloudWatch: CloudWatch, clock:Clock,  lamdaTimeout: Duration) = this(
    ssmConfig.config,
    ValidateReceiptLambda.validateReceipts(ssmConfig, client, cloudWatch, clock, lamdaTimeout),
    client, cloudWatch
  )

  def this(ssmConfig: SsmConfig, amazonCloudWatch: AmazonCloudWatch, clock: Clock, lambdaTimeout: Duration) = this(ssmConfig, defaultHttpClient, new CloudWatchImpl(ssmConfig.stage, validateReceiptsName, amazonCloudWatch), clock ,lambdaTimeout)

  def this() {
    this(SsmConfigLoader(), AmazonCloudWatchClientBuilder.defaultClient(), Clock.systemUTC(), Duration(240, TimeUnit.SECONDS))
  }

}
