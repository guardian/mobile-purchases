package com.gu.mobilepurchases.shared.lambda

import java.io.IOException
import java.nio.charset.StandardCharsets
import java.util.concurrent.TimeUnit

import com.fasterxml.jackson.databind.JsonNode
import com.gu.mobilepurchases.shared.external.{ Jackson, Parallelism }
import okhttp3.{ Call, Callback, OkHttpClient, Request }
import org.apache.logging.log4j.LogManager

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future, Promise }
import scala.util.{ Failure, Success, Try }

object DelegatingLambda {
  def goodResponse(delegateResponse: LambdaResponse): Boolean = {
    delegateResponse.statusCode >= 200 && delegateResponse.statusCode < 400
  }
}

trait DelegateComparator {
  def apply(lambdaResponse: LambdaResponse, delegateResponse: LambdaResponse): LambdaResponse

}

class DelegatingLambda(
    underTest: (LambdaRequest => LambdaResponse),
    toHttpRequest: (LambdaRequest => Request),
    delegateComparator: DelegateComparator,
    httpClient: OkHttpClient
) extends (LambdaRequest => LambdaResponse) {
  private val logger = LogManager.getLogger(classOf[DelegatingLambda])
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext

  def apply(lambdaRequest: LambdaRequest): LambdaResponse = {
    (tryLambda(lambdaRequest), delegateTried(lambdaRequest)) match {
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

  private def tryLambda(lambdaRequest: LambdaRequest): Try[LambdaResponse] = Try {
    val eventualLambdaResponse: Future[LambdaResponse] = Future {
      underTest.apply(lambdaRequest)
    }
    Await.result(eventualLambdaResponse, Duration(4, TimeUnit.MINUTES))
  }

  private def delegateTried(lambdaRequest: LambdaRequest): Try[LambdaResponse] = Try {
    val promise = Promise[LambdaResponse]
    httpClient.newCall(toHttpRequest(lambdaRequest)).enqueue(new Callback {
      override def onFailure(call: Call, e: IOException): Unit = {
        promise.failure(e)
      }

      override def onResponse(call: Call, response: okhttp3.Response): Unit = {
        promise.success(
          LambdaResponse(
            response.code(),
            Option(response.body()).map(_.bytes()).map(new String(_, StandardCharsets.UTF_8)),
            response.headers().toMultimap.asScala.toMap.mapValues(_.asScala.last))
        )
      }
    })
    Await.result(promise.future, Duration(4, TimeUnit.MINUTES))
  }
}
