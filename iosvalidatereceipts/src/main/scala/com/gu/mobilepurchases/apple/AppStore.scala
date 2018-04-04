package com.gu.mobilepurchases.apple

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.JsonNode
import com.gu.mobilepurchases.external.Jackson.mapper
import com.typesafe.config.Config
import org.apache.http.client.methods.{CloseableHttpResponse, HttpPost}
import org.apache.http.entity.ByteArrayEntity
import org.apache.http.impl.client.{CloseableHttpClient, HttpClients}
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger

object AutoRenewableSubsStatusCodes {

  // 21000 The App Store could not read the JSON object you provided.
  val CouldNotReadJson: Int = 21000

  // 21002 The data in the receipt-data property was malformed.
  val MalformedReceiptData = 21002

  // 21003 The receipt could not be authenticated.
  val CouldNotAuthenticateReceipt = 21003

  // 21004 The shared secret you provided does not match the shared secret on file for your account.
  val IncorrectSharedSecret = 21004

  // 21005 The receipt server is not currently available.
  val ReceiptServerNotAvailable = 21005

  // 21006 This receipt is valid but the subscription has expired.
  // When this status code is returned to your server, the receipt data is also decoded and returned as part of the response.
  val ReceiptValidButSubscriptionExpired = 21006

  // 21007 This receipt is a sandbox receipt, but it was sent to the production service for verification.
  val SandboxReceiptSentToProductionService = 21007

  // 21008 This receipt is a production receipt, but it was sent to the sandbox service for verification.
  val ProductionReceiptSentToSandboxService = 21008
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
                             latest_receipt: String,
                             latest_receipt_Info: Option[AppStoreResponseReceipt],
                             latest_expired_receipt_info: Option[AppStoreResponseReceipt],
                             pending_renewal_info: JsonNode,
                             @JsonProperty("is-retryable") isRetryable: String
                           ) {
  lazy val allReceipts: Seq[AppStoreResponseReceipt] = Seq(receipt, latest_receipt_Info, latest_expired_receipt_info).flatten
  lazy val mostRecentReceipt:Option[AppStoreResponseReceipt] = allReceipts.sortBy(_.purchase_date).lastOption


}

sealed class AppStoreEnv(val url: String)

// Production url defined in http://developer.apple.com/library/mac/documentation/NetworkingInternet/Conceptual/StoreKitGuide/VerifyingStoreReceipts/VerifyingStoreReceipts.html#//apple_ref/doc/uid/TP40008267-CH104-SW3
case object Production extends AppStoreEnv("https://buy.itunes.apple.com/verifyReceipt")

// Sandbox url defined in http://developer.apple.com/library/mac/#documentation/NetworkingInternet/Conceptual/StoreKitGuide/DevelopingwithStoreKit/DevelopingwithStoreKit.html#//apple_ref/doc/uid/TP40008267-CH103-SW7
case object Sandbox extends AppStoreEnv("https://sandbox.itunes.apple.com/verifyReceipt")

// Invalid url for any safe default needs
case object Invalid extends AppStoreEnv("https://local.invalid")
object AppStoreConfig {
  val logger:Logger = LogManager.getLogger(classOf[AppStoreConfig])
  def apply(config: Config, appStoreEnvString:String): AppStoreConfig = {

    val appStoreEnv:AppStoreEnv = appStoreEnvString match {
      case "CODE" => Sandbox
      case "PROD" => Invalid // change to production when ready
      case _ => {
        logger.warn(s"Unexpected app store env $appStoreEnvString")
        Invalid
      }
    }
    AppStoreConfig.apply(config.getString("appstore.password"), appStoreEnv)
  }

}
case class AppStoreConfig(password: String, appStoreEnv: AppStoreEnv) {

}

trait AppStore {
  def send(receiptData: String): AppStoreResponse
}

class AppStoreImpl(appStoreConfig: AppStoreConfig, client: CloseableHttpClient = HttpClients.createDefault()) extends AppStore {
  def send(receiptData: String): AppStoreResponse = {
    val request = AppStoreRequest(appStoreConfig.password, receiptData)
    val bytes = mapper.writeValueAsBytes(request)
    val post = new HttpPost(appStoreConfig.appStoreEnv.url)
    val entity = new ByteArrayEntity(bytes)
    post.setEntity(entity)
    val response: CloseableHttpResponse = client.execute(post)
    try {
      val content = response.getEntity.getContent
      try {
        mapper.readValue(content, classOf[AppStoreResponse])
      }
      finally {
        content.close()
      }
    }
    finally {
      response.close()
    }
  }


}
