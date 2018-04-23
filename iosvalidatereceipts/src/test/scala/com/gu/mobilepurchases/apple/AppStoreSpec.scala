package com.gu.mobilepurchases.apple

import java.net.URI
import java.nio.charset.StandardCharsets.UTF_8

import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, Timer }
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import com.gu.mobilepurchases.shared.external.{ GlobalOkHttpClient, OkHttpClientTestUtils }
import okhttp3.{ Call, Callback, OkHttpClient, Request }
import okio.Buffer
import org.mockito.ArgumentCaptor
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.concurrent.ExecutionEnv
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

object AppStoreSpec {
  val genAppStoreResponseReceipt: Gen[AppStoreResponseReceipt] = for {
    original_purchase_date_pst <- genCommonAscii
    unique_identifier <- genCommonAscii
    original_transaction_id <- genCommonAscii
    expires_date <- genCommonAscii
    app_item_id <- genCommonAscii
    transaction_id <- genCommonAscii
    quantity <- genCommonAscii
    product_id <- genCommonAscii
    bvrs <- genCommonAscii
    bid <- genCommonAscii
    web_order_line_item_id <- genCommonAscii
    original_purchase_date_ms <- genCommonAscii
    expires_date_formatted <- genCommonAscii
    purchase_date <- genCommonAscii
    purchase_date_ms <- genCommonAscii
    expires_date_formatted_pst <- genCommonAscii
    purchase_date_pst <- genCommonAscii
    original_purchase_date <- genCommonAscii
    item_id <- genCommonAscii
  } yield AppStoreResponseReceipt(
    original_purchase_date_pst,
    unique_identifier,
    original_transaction_id,
    expires_date,
    app_item_id,
    transaction_id,
    quantity,
    product_id,
    bvrs,
    bid,
    web_order_line_item_id,
    original_purchase_date_ms,
    expires_date_formatted,
    purchase_date,
    purchase_date_ms,
    expires_date_formatted_pst,
    purchase_date_pst,
    original_purchase_date,
    item_id
  )
  val genLeafAppStoreResponse: Gen[AppStoreResponse] = for {
    status <- genCommonAscii
    receipt <- Gen.option[AppStoreResponseReceipt](genAppStoreResponseReceipt)
    latest_receipt_info <- Gen.option[AppStoreResponseReceipt](genAppStoreResponseReceipt)
    latest_expired_receipt_info <- Gen.option[AppStoreResponseReceipt](genAppStoreResponseReceipt)
    isRetryable <- Gen.option[String](genCommonAscii)
  } yield AppStoreResponse(
    status,
    receipt,
    None,
    latest_receipt_info,
    latest_expired_receipt_info,
    isRetryable

  )
  val getAppStoreResponseLeaf: Gen[(String, Map[String, AppStoreResponse])] = for {
    rootReceiptData <- genCommonAscii
    appStoreResponse <- genLeafAppStoreResponse
  } yield (rootReceiptData, Map(rootReceiptData -> appStoreResponse))

  def genAppStoreResponseNode: Gen[(String, Map[String, AppStoreResponse])] = for {
    rootReceiptData <- genCommonAscii
    appStoreResponse <- genLeafAppStoreResponse
    tree <- genAppStoreResponseTree
  } yield if (tree._2.keySet.contains(rootReceiptData)) {
    tree
  } else {
    (rootReceiptData, tree._2 + (rootReceiptData -> appStoreResponse.copy(latest_receipt = Some(tree._1))))
  }

  def genAppStoreResponseTree: Gen[(String, Map[String, AppStoreResponse])] = Gen.oneOf(genAppStoreResponseNode, getAppStoreResponseLeaf)

}

class AppStoreSpec(implicit ec: ExecutionEnv) extends Specification with Mockito with ScalaCheck {

  "AppStore" should {
    val testAppStoreResponse: AppStoreResponse = AppStoreResponse("0", Some(AppStoreResponseReceipt(
      "2012-09-30 05:24:38 America/Los_Angeles", "8342fb7a57d06570ef71b3f757f00c0f79a3e069", "20000033455312", "1352208276000", "452707806",
      "20000034829192", "1", "uk.co.guardian.gce.plusobserver.1monthsub", "268",
      "uk.co.guardian.gce", "20000001746150", "1349007878000", "2012-11-06 13:24:36 Etc/GMT",
      "2012-09-30 12:24:36 Etc/GMT", "1349007876000", "2012-11-06 05:24:36 America/Los_Angeles",
      "2012-09-30 05:24:36 America/Los_Angeles", "2012-09-30 12:24:38 Etc/GMT", "555272168")),
      Some("ewoJInNpZ25hdHVyZSIgPSAiQXNsbmJnUU52aDZmY1ZIbnhEVGxZSytZalBCMm9kVDBjYUFvZW5vei9Kb1BQTFFYbVU3Y3JwajhRdEltUGZwRDA2bWFkSlA2Smx3OWpmc3VNdlpjekNGMUxKS2JuYjBjQ2ZabngrejhqYkJNUG94ZU9jYzRxNUVWWlA0Vnhzclp0dEo2K2JrMXJDQWVzaE5CLzdFbUFEYXQ2SkVjMUtRbmJOQXBCWmFjMTJJQ0FBQURWekNDQTFNd2dnSTdvQU1DQVFJQ0NHVVVrVTNaV0FTMU1BMEdDU3FHU0liM0RRRUJCUVVBTUg4eEN6QUpCZ05WQkFZVEFsVlRNUk13RVFZRFZRUUtEQXBCY0hCc1pTQkpibU11TVNZd0pBWURWUVFMREIxQmNIQnNaU0JEWlhKMGFXWnBZMkYwYVc5dUlFRjFkR2h2Y21sMGVURXpNREVHQTFVRUF3d3FRWEJ3YkdVZ2FWUjFibVZ6SUZOMGIzSmxJRU5sY25ScFptbGpZWFJwYjI0Z1FYVjBhRzl5YVhSNU1CNFhEVEE1TURZeE5USXlNRFUxTmxvWERURTBNRFl4TkRJeU1EVTFObG93WkRFak1DRUdBMVVFQXd3YVVIVnlZMmhoYzJWU1pXTmxhWEIwUTJWeWRHbG1hV05oZEdVeEd6QVpCZ05WQkFzTUVrRndjR3hsSUdsVWRXNWxjeUJUZEc5eVpURVRNQkVHQTFVRUNnd0tRWEJ3YkdVZ1NXNWpMakVMTUFrR0ExVUVCaE1DVlZNd2daOHdEUVlKS29aSWh2Y05BUUVCQlFBRGdZMEFNSUdKQW9HQkFNclJqRjJjdDRJclNkaVRDaGFJMGc4cHd2L2NtSHM4cC9Sd1YvcnQvOTFYS1ZoTmw0WElCaW1LalFRTmZnSHNEczZ5anUrK0RyS0pFN3VLc3BoTWRkS1lmRkU1ckdYc0FkQkVqQndSSXhleFRldngzSExFRkdBdDFtb0t4NTA5ZGh4dGlJZERnSnYyWWFWczQ5QjB1SnZOZHk2U01xTk5MSHNETHpEUzlvWkhBZ01CQUFHamNqQndNQXdHQTFVZEV3RUIvd1FDTUFBd0h3WURWUjBqQkJnd0ZvQVVOaDNvNHAyQzBnRVl0VEpyRHRkREM1RllRem93RGdZRFZSMFBBUUgvQkFRREFnZUFNQjBHQTFVZERnUVdCQlNwZzRQeUdVakZQaEpYQ0JUTXphTittVjhrOVRBUUJnb3Foa2lHOTJOa0JnVUJCQUlGQURBTkJna3Foa2lHOXcwQkFRVUZBQU9DQVFFQUVhU2JQanRtTjRDL0lCM1FFcEszMlJ4YWNDRFhkVlhBZVZSZVM1RmFaeGMrdDg4cFFQOTNCaUF4dmRXLzNlVFNNR1k1RmJlQVlMM2V0cVA1Z204d3JGb2pYMGlreVZSU3RRKy9BUTBLRWp0cUIwN2tMczlRVWU4Y3pSOFVHZmRNMUV1bVYvVWd2RGQ0TndOWXhMUU1nNFdUUWZna1FRVnk4R1had1ZIZ2JFL1VDNlk3MDUzcEdYQms1MU5QTTN3b3hoZDNnU1JMdlhqK2xvSHNTdGNURXFlOXBCRHBtRzUrc2s0dHcrR0szR01lRU41LytlMVFUOW5wL0tsMW5qK2FCdzdDMHhzeTBiRm5hQWQxY1NTNnhkb3J5L0NVdk02Z3RLc21uT09kcVRlc2JwMGJzOHNuNldxczBDOWRnY3hSSHVPTVoydG04bnBMVW03YXJnT1N6UT09IjsKCSJwdXJjaGFzZS1pbmZvIiA9ICJld29KSW05eWFXZHBibUZzTFhCMWNtTm9ZWE5sTFdSaGRHVXRjSE4wSWlBOUlDSXlNREV5TFRBNUxUTXdJREExT2pJME9qTTRJRUZ0WlhKcFkyRXZURzl6WDBGdVoyVnNaWE1pT3dvSkluQjFjbU5vWVhObExXUmhkR1V0YlhNaUlEMGdJakV6TmpVNE5EVXdNVEV3TURBaU93b0pJblZ1YVhGMVpTMXBaR1Z1ZEdsbWFXVnlJaUE5SUNJNE16UXlabUkzWVRVM1pEQTJOVGN3WldZM01XSXpaamMxTjJZd01HTXdaamM1WVRObE1EWTVJanNLQ1NKdmNtbG5hVzVoYkMxMGNtRnVjMkZqZEdsdmJpMXBaQ0lnUFNBaU1qQXdNREF3TXpNME5UVXpNVElpT3dvSkltVjRjR2x5WlhNdFpHRjBaU0lnUFNBaU1UTTJPRFF6TnpBeE1UQXdNQ0k3Q2draVlYQndMV2wwWlcwdGFXUWlJRDBnSWpRMU1qY3dOemd3TmlJN0Nna2lkSEpoYm5OaFkzUnBiMjR0YVdRaUlEMGdJakl3TURBd01EVXpNVEV5T1RNeklqc0tDU0p4ZFdGdWRHbDBlU0lnUFNBaU1TSTdDZ2tpZDJWaUxXOXlaR1Z5TFd4cGJtVXRhWFJsYlMxcFpDSWdQU0FpTWpBd01EQXdNREk0TnpVeU5qRWlPd29KSW05eWFXZHBibUZzTFhCMWNtTm9ZWE5sTFdSaGRHVXRiWE1pSUQwZ0lqRXpORGt3TURjNE56Z3dNREFpT3dvSkltVjRjR2x5WlhNdFpHRjBaUzFtYjNKdFlYUjBaV1F0Y0hOMElpQTlJQ0l5TURFekxUQTFMVEV6SURBeU9qSXpPak14SUVGdFpYSnBZMkV2VEc5elgwRnVaMlZzWlhNaU93b0pJbWwwWlcwdGFXUWlJRDBnSWpVMU5USTNNakUyT0NJN0Nna2laWGh3YVhKbGN5MWtZWFJsTFdadmNtMWhkSFJsWkNJZ1BTQWlNakF4TXkwd05TMHhNeUF3T1RveU16b3pNU0JGZEdNdlIwMVVJanNLQ1NKd2NtOWtkV04wTFdsa0lpQTlJQ0oxYXk1amJ5NW5kV0Z5WkdsaGJpNW5ZMlV1Y0d4MWMyOWljMlZ5ZG1WeUxqRnRiMjUwYUhOMVlpSTdDZ2tpY0hWeVkyaGhjMlV0WkdGMFpTSWdQU0FpTWpBeE15MHdOQzB4TXlBd09Ub3lNem96TVNCRmRHTXZSMDFVSWpzS0NTSnZjbWxuYVc1aGJDMXdkWEpqYUdGelpTMWtZWFJsSWlBOUlDSXlNREV5TFRBNUxUTXdJREV5T2pJME9qTTRJRVYwWXk5SFRWUWlPd29KSW5CMWNtTm9ZWE5sTFdSaGRHVXRjSE4wSWlBOUlDSXlNREV6TFRBMExURXpJREF5T2pJek9qTXhJRUZ0WlhKcFkyRXZURzl6WDBGdVoyVnNaWE1pT3dvSkltSnBaQ0lnUFNBaWRXc3VZMjh1WjNWaGNtUnBZVzR1WjJObElqc0tDU0ppZG5KeklpQTlJQ0l5TmpnaU93cDkiOwoJInBvZCIgPSAiMiI7Cgkic2lnbmluZy1zdGF0dXMiID0gIjAiOwp9"),
      None, None, None)

    "work with successful samples" in {
      val mockHttpClient: OkHttpClient = mock[OkHttpClient]
      val mockCall = mock[Call]
      val captor: ArgumentCaptor[Request] = ArgumentCaptor.forClass(classOf[Request])

      mockHttpClient.newCall(captor.capture()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) => callback.onResponse(
                  mockCall,
                  OkHttpClientTestUtils.testOkHttpResponse(request, 200, Some(GlobalOkHttpClient.applicationJsonMediaType), Some(AppStoreExample.success.responseString.getBytes(UTF_8)), Map())
                )
              }
            }
            mockCall
          }
        }
      }

      new AppStoreImpl(AppStoreConfig("testPassword", Invalid), mockHttpClient, new CloudWatch {
        override def queueMetric(metricName: String, value: Double): Boolean = true

        override def sendMetricsSoFar(): Unit = ???

        override def startTimer(metricName: String): Timer = mock[Timer]

        override def meterHttpStatusResponses(metricName: String, code: Int): Unit = ()
      }).send("receiptData") must beEqualTo(testAppStoreResponse).await

      val capturedRequest: Request = captor.getValue
      capturedRequest.url().uri() must beEqualTo(URI.create("https://local.invalid/"))
      val buffer = new Buffer()
      capturedRequest.body().writeTo(buffer)
      mapper.readTree(buffer.readByteArray()) must beEqualTo(mapper.readTree("""{"password":"testPassword","receipt-data":"receiptData"}"""))

    }
    "ScalaCheck" >> {
      implicit val arbitraryAppStoreResposne: Arbitrary[AppStoreResponse] = Arbitrary(AppStoreSpec.genLeafAppStoreResponse)
      prop { (expectedAppStoreResponse: AppStoreResponse) =>
        {
          val mockHttpClient: OkHttpClient = mock[OkHttpClient]
          val captor: ArgumentCaptor[Request] = ArgumentCaptor.forClass(classOf[Request])
          val mockCall = mock[Call]

          mockHttpClient.newCall(captor.capture) answers {

            (_: Any) match {
              case (request: Request) => {
                mockCall.enqueue(any[Callback]()) answers {
                  (_: Any) match {
                    case (callBack: Callback) => {
                      callBack.onResponse(
                        mockCall,
                        OkHttpClientTestUtils.testOkHttpResponse(request, 200, Some(GlobalOkHttpClient.applicationJsonMediaType), Some(mapper.writeValueAsBytes(expectedAppStoreResponse)), Map()))

                    }
                  }
                }
                mockCall
              }
            }

          }

          new AppStoreImpl(AppStoreConfig("testPassword", Invalid), mockHttpClient, new CloudWatch {
            override def queueMetric(metricName: String, value: Double): Boolean = true

            override def sendMetricsSoFar(): Unit = ???

            override def startTimer(metricName: String): Timer = mock[Timer]

            override def meterHttpStatusResponses(metricName: String, code: Int): Unit = ()
          }).send("receiptData") must beEqualTo(expectedAppStoreResponse).await

          val captureRequest: Request = captor.getValue
          captureRequest.url().uri() must beEqualTo(URI.create("https://local.invalid/"))

          val buffer = new Buffer
          captureRequest.body().writeTo(buffer)

          mapper.readTree(buffer.readByteArray()) must beEqualTo(mapper.readTree("""{"password":"testPassword","receipt-data":"receiptData"}"""))

        }
      }.setArbitrary(arbitraryAppStoreResposne)

    }
  }
}
