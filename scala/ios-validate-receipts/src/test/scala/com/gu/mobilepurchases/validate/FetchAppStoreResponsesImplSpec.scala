package com.gu.mobilepurchases.validate

import java.time.Instant
import java.util.concurrent.{ ConcurrentLinkedQueue, TimeUnit }

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.gu.mobilepurchases.apple.{ AppStoreExample, AppStoreResponse, AppStoreSpec }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchMetrics, Timer }
import com.gu.mobilepurchases.shared.external.Parallelism
import org.scalacheck.Arbitrary
import org.specs2.ScalaCheck
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.collection.JavaConverters._
import scala.concurrent.duration.{ Duration, FiniteDuration }
import scala.concurrent.{ ExecutionContext, Future }

class FetchAppStoreResponsesImplSpec extends Specification with ScalaCheck with Mockito {
  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext
  "FetchAllValidatedReceiptsImpl" should {
    val minuteDuration: FiniteDuration = Duration(1, TimeUnit.MINUTES)
    val ignoreCloudWatch: CloudWatchMetrics = new CloudWatchMetrics {
      override def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit, instant: Instant): Boolean = true

      override def startTimer(metricName: String): Timer = mock[Timer]

      override def meterHttpStatusResponses(metricName: String, code: Int): Unit = ()
    }
    val responseWithoutNestedReceipts: AppStoreResponse = AppStoreExample.successAsAppStoreResponse.copy(latest_receipt = None)
    "Empty set" in {
      new FetchAppStoreResponsesImpl((_: String) => throw new UnsupportedOperationException, ignoreCloudWatch, minuteDuration).fetchAllValidatedTransactions(
        Set()) must beEqualTo(Map())
    }
    "Single AppStoreResponse with no nested receipts" in {
      new FetchAppStoreResponsesImpl((receiptData: String) => Future.successful {
        receiptData must beEqualTo("test")
        responseWithoutNestedReceipts

      }, ignoreCloudWatch, minuteDuration).fetchAllValidatedTransactions(Set("test")) must beEqualTo(Map("test" -> responseWithoutNestedReceipts))
    }
    "AppStoreResponse within AppStoreResponse also returned" in {
      val responseWithNestedReceipts: AppStoreResponse = responseWithoutNestedReceipts.copy(latest_receipt = Some("testInner"))
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        Future.successful {
          receiptData match {
            case "testNested" => responseWithNestedReceipts
            case "testInner"  => responseWithoutNestedReceipts
            case other =>
              Set("testNested", "testInner") must contain(other)
              throw new IllegalStateException("Unexpected receipt data")
          }
        }
      }, ignoreCloudWatch, minuteDuration).fetchAllValidatedTransactions(Set("testNested")) must beEqualTo(Map(
        "testInner" -> responseWithoutNestedReceipts,
        "testNested" -> responseWithNestedReceipts
      ))
    }

    "Caching works" in {
      val responseWithNestedReceipts: AppStoreResponse = responseWithoutNestedReceipts.copy(latest_receipt = Some("test")) //circular loop!

      val responses = new ConcurrentLinkedQueue[AppStoreResponse](List(responseWithNestedReceipts).asJavaCollection)
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        Future.successful {
          receiptData match {
            case "test" => responses.poll()
            case _      => throw new IllegalStateException("Unexpected receipt data")
          }
        }
      }, ignoreCloudWatch, minuteDuration).fetchAllValidatedTransactions(Set("test")) must beEqualTo(
        Map("test" -> responseWithNestedReceipts)
      )
    }
    "Async works" in {
      val arrived = new ConcurrentLinkedQueue[String]()
      val sent = new ConcurrentLinkedQueue[String]()
      val delay = new ConcurrentLinkedQueue[Int](List(1, 0).asJavaCollection)
      new FetchAppStoreResponsesImpl((receiptData: String) => Future {
        arrived.add(receiptData)
        Thread.sleep(1000 * delay.poll())
        sent.add(receiptData)
        responseWithoutNestedReceipts

      }, ignoreCloudWatch, minuteDuration).fetchAllValidatedTransactions(Set("test", "test2")) must beEqualTo(Map(
        "test" -> responseWithoutNestedReceipts,
        "test2" -> responseWithoutNestedReceipts
      ))
      arrived.toArray.reverse must beEqualTo(sent.toArray())
    }

    "Match all receipt data" >> {
      implicit val arbitraryRootReceiptDataWithAppStoreResponsesByReceiptData: Arbitrary[(String, Map[String, AppStoreResponse])] = Arbitrary(AppStoreSpec.genAppStoreResponseTree)

      prop {
        (rootReceiptDataWithAppStoreResponsesByReceiptData: (String, Map[String, AppStoreResponse])) =>
          {
            new FetchAppStoreResponsesImpl((receiptData: String) =>
              Future.successful {
                rootReceiptDataWithAppStoreResponsesByReceiptData._2(receiptData)
              }, ignoreCloudWatch, minuteDuration) fetchAllValidatedTransactions Set(rootReceiptDataWithAppStoreResponsesByReceiptData._1) must beEqualTo(
              rootReceiptDataWithAppStoreResponsesByReceiptData._2
            )
          }

      }.setArbitrary(arbitraryRootReceiptDataWithAppStoreResponsesByReceiptData)
    }

  }

}
