package com.gu.mobilepurchases.validate

import java.util.concurrent.TimeUnit

import com.gu.mobilepurchases.apple.{ AppStore, AppStoreResponse }
import com.gu.mobilepurchases.shared.external.Parallelism
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future }

trait FetchAppStoreResponses {
  def fetchAllValidatedTransactions(remainingReceipts: Set[String]): Set[AppStoreResponse]
}

object FetchAppStoreResponsesImpl {
  val logger: Logger = LogManager.getLogger(classOf[FetchAppStoreResponsesImpl])
}

class FetchAppStoreResponsesImpl(
    appStore: AppStore) extends FetchAppStoreResponses {
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext

  def fetchAllValidatedTransactions(remainingReceipts: Set[String]): Set[AppStoreResponse] = {
    val futureResponse: Future[Set[AppStoreResponse]] = Future {
      fetchAppStoreResponsesFuture(remainingReceipts, Set(), Set())
    }.flatten
    Await.result(
      futureResponse,
      Duration(4, TimeUnit.MINUTES))
  }

  private def fetchAppStoreResponsesFuture(
    remainingReceipts: Set[String],
    processedReceipts: Set[String],
    existingAppStoreResponses: Set[AppStoreResponse]): Future[Set[AppStoreResponse]] = {
    val unprocessedReceipts: Set[String] = remainingReceipts.filterNot((receiptData: String) => processedReceipts.contains(receiptData))
    FetchAppStoreResponsesImpl.logger.info(s"Unprocessed number ${unprocessedReceipts.size}")
    if (unprocessedReceipts.isEmpty) {
      FetchAppStoreResponsesImpl.logger.info("Finished processing app store requests")
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
