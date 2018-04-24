package com.gu.mobilepurchases.validate

import java.util.concurrent.ConcurrentLinkedQueue

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.gu.mobilepurchases.apple.{ AppStoreExample, AppStoreResponse, AppStoreSpec }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchMetrics, Timer }
import com.gu.mobilepurchases.shared.external.Parallelism
import org.scalacheck.Arbitrary
import org.specs2.ScalaCheck
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.collection.JavaConverters._
import scala.concurrent.{ ExecutionContext, Future }

class FetchAppStoreResponsesImplSpec extends Specification with ScalaCheck with Mockito {
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext
  "FetchAllValidatedReceiptsImpl" should {
    val ignoreCloudWatch: CloudWatchMetrics = new CloudWatchMetrics {
      override def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit): Boolean = true

      override def startTimer(metricName: String): Timer = mock[Timer]

      override def meterHttpStatusResponses(metricName: String, code: Int): Unit = ()
    }
    val responseWithoutNestedReceipts: AppStoreResponse = AppStoreExample.successAsAppStoreResponse.copy(latest_receipt = None)
    "Empty set" in {
      new FetchAppStoreResponsesImpl((_: String) => throw new UnsupportedOperationException, ignoreCloudWatch).fetchAllValidatedTransactions(
        Set()) must beEqualTo(Set())
    }
    "Single AppStoreResponse with no nested receipts" in {
      new FetchAppStoreResponsesImpl((receiptData: String) => Future {
        receiptData must beEqualTo("test")
        Some(responseWithoutNestedReceipts)

      }, ignoreCloudWatch).fetchAllValidatedTransactions(Set("test")) must beEqualTo(Set(responseWithoutNestedReceipts))
    }
    "AppStoreResponse within AppStoreResponse also returned" in {
      val responseWithNestedReceipts: AppStoreResponse = responseWithoutNestedReceipts.copy(latest_receipt = Some("testInner"))
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        Future {
          Some(receiptData match {
            case "testNested" => responseWithNestedReceipts
            case "testInner"  => responseWithoutNestedReceipts
            case other =>
              Set("testNested", "testInner") must contain(other)
              throw new IllegalStateException("Unexpected receipt data")
          })
        }
      }, ignoreCloudWatch).fetchAllValidatedTransactions(Set("testNested")) must beEqualTo(Set(responseWithoutNestedReceipts, responseWithNestedReceipts))
    }

    "Caching works" in {
      val responseWithNestedReceipts: AppStoreResponse = responseWithoutNestedReceipts.copy(latest_receipt = Some("test")) //circular loop!

      val responses = new ConcurrentLinkedQueue[AppStoreResponse](List(responseWithNestedReceipts).asJavaCollection)
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        Future {
          Some(receiptData match {
            case "test" => responses.poll()
            case _      => throw new IllegalStateException("Unexpected receipt data")
          })
        }
      }, ignoreCloudWatch).fetchAllValidatedTransactions(Set("test")) must beEqualTo(Set(responseWithNestedReceipts))
    }
    "Async works" in {
      val arrived = new ConcurrentLinkedQueue[String]()
      val sent = new ConcurrentLinkedQueue[String]()
      val delay = new ConcurrentLinkedQueue[Int](List(1, 0).asJavaCollection)
      new FetchAppStoreResponsesImpl((receiptData: String) => Future {
        arrived.add(receiptData)
        Thread.sleep(1000 * delay.poll())
        sent.add(receiptData)
        Some(responseWithoutNestedReceipts)

      }, ignoreCloudWatch).fetchAllValidatedTransactions(Set("test", "test2")) must beEqualTo(Set(responseWithoutNestedReceipts))
      (arrived.toArray).reverse must beEqualTo(sent.toArray())
    }

    "Match all receipt data" >> {
      implicit val arbitraryRootReceiptDataWithAppStoreResponsesByReceiptData: Arbitrary[(String, Map[String, AppStoreResponse])] = Arbitrary(AppStoreSpec.genAppStoreResponseTree)

      prop {
        (rootReceiptDataWithAppStoreResponsesByReceiptData: (String, Map[String, AppStoreResponse])) =>
          {
            new FetchAppStoreResponsesImpl((receiptData: String) =>
              Future {
                Some(rootReceiptDataWithAppStoreResponsesByReceiptData._2(receiptData))
              }, ignoreCloudWatch) fetchAllValidatedTransactions Set(rootReceiptDataWithAppStoreResponsesByReceiptData._1) must beEqualTo(
              rootReceiptDataWithAppStoreResponsesByReceiptData._2.values.toSet
            )
          }

      }.setArbitrary(arbitraryRootReceiptDataWithAppStoreResponsesByReceiptData)
    }

  }

}
