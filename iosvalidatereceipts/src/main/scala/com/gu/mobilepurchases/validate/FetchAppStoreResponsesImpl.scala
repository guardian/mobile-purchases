package com.gu.mobilepurchases.validate

import java.time.Clock
import java.util.concurrent.TimeUnit

import com.gu.mobilepurchases.apple.{ AppStore, AppStoreResponse }

import scala.concurrent.duration.Duration
import scala.concurrent.{ Await, ExecutionContext, Future }

trait FetchAppStoreResponses {
  def fetchAllValidatedTransactions(remainingReceipts: Set[String]): Set[AppStoreResponse]
}

class FetchAppStoreResponsesImpl(
    appStore: AppStore,
    clock: Clock = Clock.systemUTC()) extends FetchAppStoreResponses {
  implicit val executionContext: ExecutionContext = ExecutionContext.global

  def fetchAllValidatedTransactions(remainingReceipts: Set[String]): Set[AppStoreResponse] = Await.result(
    fetchAppStoreResponses(remainingReceipts, Set(), Set()),
    Duration(1, TimeUnit.MINUTES))

  private def fetchAppStoreResponses(remainingReceipts: Set[String], processedReceipts: Set[String],
    existingAppStoreResponses: Set[AppStoreResponse]): Future[Set[AppStoreResponse]] = {
    val unprocessedReceipts: Set[String] = remainingReceipts.filterNot((receiptData: String) => processedReceipts.contains(receiptData))
    if (unprocessedReceipts.isEmpty) {
      Future(existingAppStoreResponses)
    } else {
      Future.sequence(unprocessedReceipts.map((receipt: String) => Future {
        appStore.send(receipt)
      })).flatMap((appStoreResponses: Set[AppStoreResponse]) => {
        fetchAppStoreResponses(
          appStoreResponses.flatMap((_: AppStoreResponse).latest_receipt),
          processedReceipts ++ unprocessedReceipts,
          appStoreResponses ++ existingAppStoreResponses
        )
      })
    }
  }

}
