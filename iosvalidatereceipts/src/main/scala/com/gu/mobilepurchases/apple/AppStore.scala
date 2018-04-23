package com.gu.mobilepurchases.apple

import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicLong

import com.fasterxml.jackson.annotation.JsonProperty
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.{ Base64Utils, GlobalOkHttpClient }
import com.typesafe.config.Config
import okhttp3.{ Call, Callback, OkHttpClient, Request, RequestBody }
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.concurrent.{ Future, Promise }
import scala.util.{ Failure, Success, Try }

object AutoRenewableSubsStatusCodes {

  // 21000 The App Store could not read the JSON object you provided.
  val CouldNotReadJson: Int = 21000

  // 21002 The data in the receipt-data property was malformed.
  val MalformedReceiptData: Int = 21002

  // 21003 The receipt could not be authenticated.
  val CouldNotAuthenticateReceipt: Int = 21003

  // 21004 The shared secret you provided does not match the shared secret on file for your account.
  val IncorrectSharedSecret: Int = 21004

  // 21005 The receipt server is not currently available.
  val ReceiptServerNotAvailable: Int = 21005

  // 21006 This receipt is valid but the subscription has expired.
  // When this status code is returned to your server, the receipt data is also decoded and returned as part of the response.
  val ReceiptValidButSubscriptionExpired: Int = 21006

  // 21007 This receipt is a sandbox receipt, but it was sent to the production service for verification.
  val SandboxReceiptSentToProductionService: Int = 21007

  // 21008 This receipt is a production receipt, but it was sent to the sandbox service for verification.
  val ProductionReceiptSentToSandboxService: Int = 21008
}

case class AppStoreRequest(
    password: String,
    @JsonProperty("receipt-data") receiptData: String
)

case class AppStoreResponseReceipt(
    original_purchase_date_pst: String,
    unique_identifier: String,
    original_transaction_id: String,
    expires_date: String,
    app_item_id: String,
    transaction_id: String,
    quantity: String,
    product_id: String,
    bvrs: String,
    bid: String,
    web_order_line_item_id: String,
    original_purchase_date_ms: String,
    expires_date_formatted: String,
    purchase_date: String,
    purchase_date_ms: String,
    expires_date_formatted_pst: String,
    purchase_date_pst: String,
    original_purchase_date: String,
    item_id: String
)

case class AppStoreResponse(
    status: String,
    receipt: Option[AppStoreResponseReceipt],
    latest_receipt: Option[String],
    latest_receipt_Info: Option[AppStoreResponseReceipt],
    latest_expired_receipt_info: Option[AppStoreResponseReceipt],
    @JsonProperty("is-retryable") isRetryable: Option[String]
) {
  lazy val allReceipts: Set[AppStoreResponseReceipt] = Set(receipt, latest_receipt_Info, latest_expired_receipt_info).flatten

}

sealed class AppStoreEnv(val url: String)

// Production url defined in http://developer.apple.com/library/mac/documentation/NetworkingInternet/Conceptual/StoreKitGuide/VerifyingStoreReceipts/VerifyingStoreReceipts.html#//apple_ref/doc/uid/TP40008267-CH104-SW3
case object Production extends AppStoreEnv("https://buy.itunes.apple.com/verifyReceipt")

// Sandbox url defined in http://developer.apple.com/library/mac/#documentation/NetworkingInternet/Conceptual/StoreKitGuide/DevelopingwithStoreKit/DevelopingwithStoreKit.html#//apple_ref/doc/uid/TP40008267-CH103-SW7
case object Sandbox extends AppStoreEnv("https://sandbox.itunes.apple.com/verifyReceipt")

// Invalid url for any safe default needs
case object Invalid extends AppStoreEnv("https://local.invalid")

object AppStoreConfig {
  val logger: Logger = LogManager.getLogger(classOf[AppStoreConfig])
  val messageDigest = MessageDigest.getInstance("SHA-256")

  def apply(config: Config, stage: String): AppStoreConfig = {
    val appStoreEnv: AppStoreEnv = stage match {
      case "CODE" => Sandbox
      case "PROD" => Invalid // change to production when ready
      case _ =>
        logger.warn(s"Unexpected app store env $stage")
        Invalid
    }
    AppStoreConfig.apply(config.getString("appstore.password"), appStoreEnv)
  }

}

case class AppStoreConfig(password: String, appStoreEnv: AppStoreEnv) {

}

trait AppStore {
  def send(receiptData: String): Future[AppStoreResponse]
}

object AppStoreImpl {
  val logger: Logger = LogManager.getLogger(classOf[AppStoreImpl])
}

class AppStoreImpl(appStoreConfig: AppStoreConfig, client: OkHttpClient) extends AppStore {
  val counter = new AtomicLong(0)

  def send(receiptData: String): Future[AppStoreResponse] = {
    val request: AppStoreRequest = AppStoreRequest(appStoreConfig.password, receiptData)
    val hash = new String(Base64Utils.encoder.encode(AppStoreConfig.messageDigest.digest(Base64Utils.decoder.decode(receiptData))))
    val count: Long = counter.incrementAndGet()
    AppStoreImpl.logger.info(s"Sending request ${count}: ${hash}")
    val promise = Promise[AppStoreResponse]
    client.newCall(new Request.Builder().url(appStoreConfig.appStoreEnv.url).post(RequestBody.create(
      GlobalOkHttpClient.applicationJsonMediaType,
      mapper.writeValueAsBytes(request))).build()
    ).enqueue(new Callback {
      override def onFailure(call: Call, e: IOException): Unit = promise.failure(e)

      override def onResponse(call: Call, response: okhttp3.Response): Unit = {
        AppStoreImpl.logger.info(s"Got response ${count}")
        Try {
          mapper.readValue[AppStoreResponse](response.body().bytes())
        } match {
          case Success(appStoreResponse: AppStoreResponse) => promise.success(appStoreResponse)
          case Failure(throwable)                          => promise.failure(throwable)
        }
      }
    })
    promise.future
  }

}
