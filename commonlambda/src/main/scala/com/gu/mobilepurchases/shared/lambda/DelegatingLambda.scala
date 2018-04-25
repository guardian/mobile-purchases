package com.gu.mobilepurchases.shared.lambda

import java.io.IOException
import java.nio.charset.StandardCharsets
import java.util.concurrent.{ TimeUnit, TimeoutException }

import com.fasterxml.jackson.databind.JsonNode
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, Timer }
import com.gu.mobilepurchases.shared.external.{ Jackson, Parallelism }
import okhttp3.{ Call, Callback, OkHttpClient, Request, Response }
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future, Promise }
import scala.util.{ Failure, Success, Try }

object DelegatingLambda {
  def goodStatus(statusCode: Int): Boolean = {
    statusCode >= 200 && statusCode < 300
  }
}

trait DelegateComparator {
  def apply(lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse

}

case class DelegateLambdaConfig(
    lambdaName: String,
    wholeExecutionTimeout: Duration = Duration(270, TimeUnit.SECONDS),
    postProcessingDurationWindow: Duration = Duration(10, TimeUnit.SECONDS)
)

class DelegatingLambda(
    underTest: (LambdaRequest => LambdaResponse),
    toHttpRequest: (LambdaRequest => Request),
    delegateComparator: DelegateComparator,
    httpClient: OkHttpClient,
    cloudWatch: CloudWatch,
    delegateLambdaConfig: DelegateLambdaConfig
) extends (LambdaRequest => LambdaResponse) {
  private val delegateAndLambdaTimeout: Duration = delegateLambdaConfig.wholeExecutionTimeout.minus(delegateLambdaConfig.postProcessingDurationWindow)
  private val logger: Logger = LogManager.getLogger(classOf[DelegatingLambda])
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext

  def apply(lambdaRequest: LambdaRequest): LambdaResponse = {
    val triedLambdaAndDelegate: (Try[LambdaResponse], Try[LambdaResponse]) = tryAndTimeoutLambdaAndDelegate(lambdaRequest)
    triedLambdaAndDelegate match {
      case (Success(lambda), Success(delegate)) => {
        logBodyDifference(lambdaRequest, lambda, delegate)
        logMetadataDifference(lambdaRequest, lambda, delegate)
        delegateComparator.apply(lambda, delegate)

      }
      case (Failure(lambdaThrowable), Success(delegate)) => {
        logger.warn(s"Lambda failed for $lambdaRequest", lambdaThrowable)
        delegate
      }
      case (Success(lambda), Failure(delegateThrowable)) => {
        logger.warn(s"Delegate failed for $lambdaRequest", delegateThrowable)
        lambda
      }
      case (Failure(lambdaThrowable), Failure(delegateThrowable)) => {
        logger.warn(s"Delegate Failure, but both failed for $lambdaRequest", delegateThrowable)
        logger.warn(s"Lambda Failure, but both failed for $lambdaRequest", lambdaThrowable)
        throw delegateThrowable
      }
    }

  }

  private def tryAndTimeoutLambdaAndDelegate(lambdaRequest: LambdaRequest): (Try[LambdaResponse], Try[LambdaResponse]) = {
    val promiseLambdaResponse: Promise[LambdaResponse] = Promise[LambdaResponse]
    val promiseDelegateResponse: Promise[LambdaResponse] = Promise[LambdaResponse]

    val futureLambdaResponse: Future[LambdaResponse] = promiseLambdaResponse.future
    val futureDelegateResponse: Future[LambdaResponse] = promiseDelegateResponse.future

    val eventualResponses: Future[Seq[LambdaResponse]] = Future.sequence(Seq(futureLambdaResponse, futureDelegateResponse))
    delegateResponseF(lambdaRequest).transform((triedDelegateResponse: Try[LambdaResponse]) => {
      promiseDelegateResponse.complete(triedDelegateResponse)
      triedDelegateResponse
    })
    Future.successful { underTest.apply(lambdaRequest) }.transform((triedLambdaResponse: Try[LambdaResponse]) => {
      promiseLambdaResponse.complete(triedLambdaResponse)
      triedLambdaResponse
    })
    Try {
      Await.ready(eventualResponses, delegateAndLambdaTimeout)
    }
    val triedDelegateResponse: Try[LambdaResponse] = futureDelegateResponse.value.getOrElse(Failure(new TimeoutException("Delegate timed out")))
    val triedLambdaResponse: Try[LambdaResponse] = futureLambdaResponse.value.getOrElse(Failure(new TimeoutException("Lambdatimed out")))
    val triedLambdaAndDelegate: (Try[LambdaResponse], Try[LambdaResponse]) = (triedLambdaResponse, triedDelegateResponse)
    triedLambdaAndDelegate
  }

  def logMetadataDifference(lambdaRequest: LambdaRequest, lambda: LambdaResponse, delegate: LambdaResponse): Unit = {
    val expectedLowercaseHeaders = Set("Content-Type").map((_: String).toLowerCase)
    val metadataLambda: LambdaResponse = lambda.copy(maybeBody = None, headers = lambda.headers.filter {
      case (key: String, _: String) => expectedLowercaseHeaders.contains(key.toLowerCase())
    })

    val metadataDelegate: LambdaResponse = delegate.copy(maybeBody = None, headers = lambda.headers.filter {
      case (key: String, _: String) => expectedLowercaseHeaders.contains(key.toLowerCase())
    })
    if (!metadataLambda.equals(metadataDelegate)) {
      logger.warn(s"Metadata variance for request {} lambda: {} delegate {}", lambdaRequest: Any, metadataLambda: Any, metadataDelegate: Any)
    }
  }

  def logBodyDifference(lambdaRequest: LambdaRequest, lambda: LambdaResponse, delegate: LambdaResponse): Unit = {
    def extractAnyJson(maybeBody: Option[String]): Option[JsonNode] = {
      Try {
        maybeBody.map(Jackson.mapper.readTree(_: String))
      }.toOption.flatten
    }

    if (!((extractAnyJson(lambda.maybeBody), extractAnyJson(delegate.maybeBody)) match {
      case (Some(lambdaJson), Some(delegateJson)) => lambdaJson.equals(delegateJson)
      case (None, None)                           => true
      case (_, _)                                 => false
    })) {
      logger.warn(s"Mismatch bodies in Request $lambdaRequest \n\n Lambda: $lambda \n\n Delegate $delegate")
    }

  }

  private def delegateResponseF(lambdaRequest: LambdaRequest): Future[LambdaResponse] = {
    val promise = Promise[LambdaResponse]
    val timer: Timer = cloudWatch.startTimer(s"${delegateLambdaConfig.lambdaName}-delegate")
    httpClient.newCall(toHttpRequest(lambdaRequest)).enqueue(new Callback {
      override def onFailure(call: Call, e: IOException): Unit = {
        timer.fail
        promise.failure(e)
      }

      override def onResponse(call: Call, response: Response): Unit = {
        if (DelegatingLambda.goodStatus(response.code())) {
          timer.succeed
        } else {
          timer.fail
        }
        promise.success(
          LambdaResponse(
            response.code(),
            Option(response.body()).map(_.bytes()).map(new String(_, StandardCharsets.UTF_8)),
            response.headers().toMultimap.asScala.toMap.mapValues(_.asScala.last))
        )
      }
    })
    promise.future
  }
}
