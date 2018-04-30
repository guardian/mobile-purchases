package com.gu.mobilepurchases.validate

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.gu.mobilepurchases.apple.{ AppStore, AppStoreResponse }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchMetrics, Timer }
import com.gu.mobilepurchases.shared.external.Parallelism
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future }

trait FetchAppStoreResponses {
  def fetchAllValidatedTransactions(remainingReceipts: Set[String]): Map[String, AppStoreResponse]
}

class FetchAppStoreResponsesImpl(
    appStore: AppStore,
    cloudWatch: CloudWatchMetrics,
    timeout: Duration
) extends FetchAppStoreResponses {
  private val logger: Logger = LogManager.getLogger(classOf[FetchAppStoreResponsesImpl])
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext

  def fetchAllValidatedTransactions(receipts: Set[String]): Map[String, AppStoreResponse] = {
    val timer: Timer = cloudWatch.startTimer("fetch-all-timer")
    val futureResponse: Future[Map[String, AppStoreResponse]] = fetchAppStoreResponsesFuture(receipts, Map()).transform(
      (success: Map[String, Option[AppStoreResponse]]) => {
        timer.succeed
        success.filter(_._2.nonEmpty).mapValues(_.get)
      },
      (failure: Throwable) => {
        timer.fail
        failure
      })
    Await.result(
      futureResponse,
      timeout)
  }

  private def fetchAppStoreResponsesFuture(
    remainingReceipts: Set[String],
    fetchedReceipts: Map[String, Option[AppStoreResponse]]
  ): Future[Map[String, Option[AppStoreResponse]]] = {
    val unprocessedReceipts: Set[String] = remainingReceipts.diff(fetchedReceipts.keySet)
    if (unprocessedReceipts.isEmpty) {
      cloudWatch.queueMetric("fetch-all-total", fetchedReceipts.size, StandardUnit.Count)
      Future.successful(fetchedReceipts)
    } else {
      asyncFetchReceipts(unprocessedReceipts).flatMap((appStoreResponses: Map[String, Option[AppStoreResponse]]) => {
        val latestReceiptsReturned: Set[String] = appStoreResponses.values.flatten.flatMap((_: AppStoreResponse).latest_receipt).toSet
        val latestReceiptsToFetch: Set[String] = latestReceiptsReturned.diff(unprocessedReceipts)
        val updatedFetchedReceipts: Map[String, Option[AppStoreResponse]] = appStoreResponses ++ fetchedReceipts
        fetchAppStoreResponsesFuture(
          latestReceiptsToFetch,
          updatedFetchedReceipts
        )
      })
    }
  }

  private def asyncFetchReceipts(unprocessedReceipts: Set[String]): Future[Map[String, Option[AppStoreResponse]]] = {
    val eventualResponses: Future[Seq[(String, Option[AppStoreResponse])]] = Future.sequence(unprocessedReceipts
      .toSeq
      .map((receipt: String) =>
        appStore.send(receipt).map((maybeResponse: Option[AppStoreResponse]) => receipt -> maybeResponse)
      )
    )
    eventualResponses.map((_: Seq[(String, Option[AppStoreResponse])]).toMap)
  }

}
