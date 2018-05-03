package com.gu.mobilepurchases.shared.lambda

import java.io.IOException
import java.nio.charset.StandardCharsets
import java.util.concurrent.{ TimeUnit, TimeoutException }

import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, Timer }
import com.gu.mobilepurchases.shared.external.Parallelism
import okhttp3.{ Call, Callback, OkHttpClient, Request, Response, ResponseBody }
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future, Promise }
import scala.util.{ Failure, Success, Try }

case class LambdaDelegateResponseTried(lambda: Try[LambdaResponse], delegate: Try[LambdaResponse])
case class LambdaDelegateResponse(lambda: LambdaResponse, delegate: LambdaResponse)

object DelegatingLambda {
  def goodStatus(statusCode: Int): Boolean = {
    statusCode >= 200 && statusCode < 300
  }
}

trait DelegateComparator {
  def apply(lambdaRequest: LambdaRequest, lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse
  def logLambdaOnly(lambdaResponse: LambdaResponse): Unit
  def logDelegateOnly(lambdaResponse: LambdaResponse): Unit
  def logNothingReturned(): Unit

}

case class DelegateLambdaConfig(
    lambdaName: String,
    wholeExecutionTimeout: Duration = Duration(29, TimeUnit.SECONDS),
    postProcessingDurationWindow: Duration = Duration(4, TimeUnit.SECONDS)
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
      case (Success(lambdaResponse), Success(delegateResponse)) => {
        logMetadataDifference(lambdaRequest, lambdaResponse, delegateResponse)
        delegateComparator.apply(lambdaRequest, lambdaResponse, delegateResponse)

      }
      case (Failure(lambdaThrowable), Success(delegate)) => {
        logger.warn(s"Lambda failed for $lambdaRequest", lambdaThrowable)
        delegateComparator.logDelegateOnly(delegate)
        delegate
      }
      case (Success(lambda), Failure(delegateThrowable)) => {
        logger.warn(s"Delegate failed for $lambdaRequest", delegateThrowable)
        delegateComparator.logLambdaOnly(lambda)
        lambda
      }
      case (Failure(lambdaThrowable), Failure(delegateThrowable)) => {
        logger.warn(s"Delegate Failure, but both failed for $lambdaRequest", delegateThrowable)
        logger.warn(s"Lambda Failure, but both failed for $lambdaRequest", lambdaThrowable)
        delegateComparator.logNothingReturned()
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
    Future { underTest.apply(lambdaRequest) }.transform((triedLambdaResponse: Try[LambdaResponse]) => {
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

  private def delegateResponseF(lambdaRequest: LambdaRequest): Future[LambdaResponse] = {
    val promise: Promise[LambdaResponse] = Promise[LambdaResponse]
    val timer: Timer = cloudWatch.startTimer(s"${delegateLambdaConfig.lambdaName}-delegate")
    httpClient.newCall(toHttpRequest(lambdaRequest)).enqueue(new Callback {
      override def onFailure(call: Call, e: IOException): Unit = {

        timer.fail
        promise.failure(e)
      }

      override def onResponse(call: Call, response: Response): Unit = {
        val maybeResponseBody: Option[ResponseBody] = Option(response.body())
        Try {
          LambdaResponse(
            response.code(),
            maybeResponseBody.map(_.bytes()).map(new String(_, StandardCharsets.UTF_8)),
            response.headers().toMultimap.asScala.toMap.mapValues(_.asScala.last))
        } match {
          case Success(lambdaResponse) => {
            if (DelegatingLambda.goodStatus(lambdaResponse.statusCode)) {
              timer.succeed
            } else {
              timer.fail
            }
            promise.success(lambdaResponse)
          }
          case Failure(t) => {
            timer.fail
            promise.failure(t)
          }
        }
        maybeResponseBody.map(_.close())

      }
    })
    promise.future
  }
}
