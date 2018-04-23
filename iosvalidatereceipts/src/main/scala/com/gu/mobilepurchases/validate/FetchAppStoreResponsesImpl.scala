package com.gu.mobilepurchases.validate

import java.util.concurrent.TimeUnit

import com.gu.mobilepurchases.apple.{ AppStore, AppStoreResponse }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchMetrics, CloudWatchImpl, Timer }
import com.gu.mobilepurchases.shared.external.Parallelism
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future }

trait FetchAppStoreResponses {
  def fetchAllValidatedTransactions(remainingReceipts: Set[String]): Set[AppStoreResponse]
}

class FetchAppStoreResponsesImpl(
    appStore: AppStore, cloudWatch: CloudWatchMetrics) extends FetchAppStoreResponses {
  private val logger: Logger = LogManager.getLogger(classOf[FetchAppStoreResponsesImpl])
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext

  def fetchAllValidatedTransactions(receipts: Set[String]): Set[AppStoreResponse] = {
    val timer: Timer = cloudWatch.startTimer("fetch-all-timer")
    val futureResponse: Future[Set[AppStoreResponse]] = fetchAppStoreResponsesFuture(receipts, Set(), Set()).transform(attempt => {
      if (attempt.isSuccess) {
        timer.succeed
      } else {
        timer.fail
      }
      attempt
    })

    Await.result(
      futureResponse,
      Duration(4, TimeUnit.MINUTES))
  }

  private def fetchAppStoreResponsesFuture(
    remainingReceipts: Set[String],
    processedReceipts: Set[String],
    existingAppStoreResponses: Set[AppStoreResponse]
  ): Future[Set[AppStoreResponse]] = {
    val unprocessedReceipts: Set[String] = remainingReceipts.filterNot((receiptData: String) => processedReceipts.contains(receiptData))
    if (unprocessedReceipts.isEmpty) {
      cloudWatch.queueMetric("fetch-all-total", existingAppStoreResponses.size)
      Future(existingAppStoreResponses)
    } else {
      val eventualResponses: Set[Future[AppStoreResponse]] = unprocessedReceipts.map((receipt: String) => futureAppStoreResponse(receipt))
      Future.sequence(eventualResponses).flatMap((appStoreResponses: Set[AppStoreResponse]) => {
        fetchAppStoreResponsesFuture(
          appStoreResponses.toSeq.flatMap((_: AppStoreResponse).latest_receipt.toSeq).toSet,
          processedReceipts ++ unprocessedReceipts,
          appStoreResponses ++ existingAppStoreResponses
        )
      })
    }
  }

  private def futureAppStoreResponse(receipt: String): Future[AppStoreResponse] = {
    appStore.send(receipt)

  }
}
