package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.{ AppStore, AppStoreExample, AppStoreResponse, AppStoreSpec }
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

class FetchAppStoreResponsesImplSpec extends Specification with ScalaCheck {
  "FetchAllValidatedReceiptsImpl" should {

    val responseWithoutNestedReceipts: AppStoreResponse = AppStoreExample.successAsAppStoreResponse.copy(latest_receipt = None)
    "Empty set" in {
      new FetchAppStoreResponsesImpl((_: String) => throw new UnsupportedOperationException).fetchAllValidatedTransactions(
        Set()) must beEqualTo(Set())
    }
    "Single AppStoreResponse with no nested receipts" in {
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        receiptData must beEqualTo("test")
        responseWithoutNestedReceipts

      }).fetchAllValidatedTransactions(Set("test")) must beEqualTo(Set(responseWithoutNestedReceipts))
    }
    "AppStoreResponse within AppStoreResponse also returned" in {
      val responseWithNestedReceipts: AppStoreResponse = responseWithoutNestedReceipts.copy(latest_receipt = Some("testInner"))
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        receiptData match {
          case "testNested" => responseWithNestedReceipts
          case "testInner"  => responseWithoutNestedReceipts
          case other =>
            Set("testNested", "testInner") must contain(other)
            throw new IllegalStateException("Unexpected receipt data")
        }
      }).fetchAllValidatedTransactions(Set("testNested")) must beEqualTo(Set(responseWithoutNestedReceipts, responseWithNestedReceipts))
    }

    "Cache receipt data" >> {
      implicit val arbitraryAppStoreResponse: Arbitrary[AppStoreResponse] = Arbitrary(AppStoreSpec.genLeafAppStoreResponse)
      implicit val arbitraryReceiptData: Arbitrary[Set[String]] = Arbitrary(Gen.containerOf[Set, String](genCommonAscii))
      prop {
        (appStoreResponse: AppStoreResponse, receiptDatas: Set[String]) =>
          {
            new FetchAppStoreResponsesImpl((receiptData: String) => {
              receiptDatas must contain(receiptData)
              appStoreResponse
            }).fetchAllValidatedTransactions(receiptDatas) must beEqualTo(receiptDatas.headOption.map((_: String) => Set(appStoreResponse)).getOrElse(Set()))
          }

      }.setArbitraries(arbitraryAppStoreResponse, arbitraryReceiptData)
    }
    "Match all receipt data" >> {
      implicit val arbitraryRootReceiptDataWithAppStoreResponsesByReceiptData: Arbitrary[(String, Map[String, AppStoreResponse])] = Arbitrary(AppStoreSpec.genAppStoreResponseTree)

      prop {
        (rootReceiptDataWithAppStoreResponsesByReceiptData: (String, Map[String, AppStoreResponse])) =>
          {
            new FetchAppStoreResponsesImpl((receiptData: String) =>
              rootReceiptDataWithAppStoreResponsesByReceiptData._2(receiptData)
            ) fetchAllValidatedTransactions Set(rootReceiptDataWithAppStoreResponsesByReceiptData._1) must beEqualTo(
              rootReceiptDataWithAppStoreResponsesByReceiptData._2.values.toSet
            )
          }

      }.setArbitrary(arbitraryRootReceiptDataWithAppStoreResponsesByReceiptData)
    }

  }

}
