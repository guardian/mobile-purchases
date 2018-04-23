package com.gu.mobilepurchases.lambda

import java.io.{ ByteArrayInputStream, ByteArrayOutputStream }
import java.time.Clock.systemUTC
import java.time.ZoneOffset.UTC
import java.time.{ Clock, Duration, ZonedDateTime }

import com.amazonaws.SdkClientException
import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.gu.mobilepurchases.apple.AppStoreExample
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionPurchaseActiveInterval }
import com.gu.mobilepurchases.persistence.TransactionPersistenceImpl
import com.gu.mobilepurchases.shared.cloudwatch.CloudWatchImpl
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient.applicationJsonMediaType
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.OkHttpClientTestUtils.testOkHttpResponse
import com.gu.mobilepurchases.shared.lambda.{ ApiGatewayLambdaRequest, ApiGatewayLambdaResponse, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppId, UserPurchasePersistenceImpl, UserPurchasesByUserIdAndAppId, UserPurchasesStringsByUserIdColonAppId }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.mobilepurchases.validate.{ FetchAppStoreResponsesImpl, ValidateReceiptsController, ValidateReceiptsFilterExpiredImpl, ValidateReceiptsRoute, ValidateReceiptsRouteImpl, ValidateReceiptsTransformAppStoreResponseImpl, ValidateRequest, ValidateRequestAppInfo, ValidateRequestTransaction, ValidateRequestUserIds, ValidateResponse }
import com.gu.scanamo.error.DynamoReadError
import com.gu.scanamo.query.UniqueKey
import com.typesafe.config.{ Config, ConfigFactory }
import okhttp3.{ Call, Callback, OkHttpClient, Request }
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.collection.JavaConverters._
import scala.concurrent.{ ExecutionContext, Future }
import scala.util.{ Failure, Try }

class DelegatingValidateReceiptLambdaSpec extends Specification with Mockito {
  implicit val ec: ExecutionContext = ExecutionContext.global
  "DelegatingValidateReceiptLambda" should {
    val exampleRequest: ApiGatewayLambdaRequest = ApiGatewayLambdaRequest(LambdaRequest(Some(mapper.writeValueAsString(ValidateRequest(
      ValidateRequestUserIds("gnmUdid", "vendorUdid"),
      Map(),
      ValidateRequestAppInfo("appId"),
      List(ValidateRequestTransaction("transactionid", "receipt", "typeField")),
      "nominatedHandler"
    )))))
    val validateReceiptsController: ValidateReceiptsController = new ValidateReceiptsController(new ValidateReceiptsRouteImpl(
      new ValidateReceiptsTransformAppStoreResponseImpl(),
      new FetchAppStoreResponsesImpl((receiptData: String) => {
        Set("receipt", AppStoreExample.successAsAppStoreResponse.latest_receipt.get) must contain(receiptData)
        Future {
          AppStoreExample.successAsAppStoreResponse
        }
      }), new ValidateReceiptsFilterExpiredImpl(Clock.offset(systemUTC(), Duration.between(
        ZonedDateTime.now(UTC), ZonedDateTime.parse("2012-11-06T13:24:36.000Z").minusHours(2)))), new TransactionPersistenceImpl(
        new UserPurchasePersistenceImpl(
          new ScanamaoUserPurchasesStringsByUserIdColonAppId {
            override def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
              userPurchasesStringsByUserIdColonAppId must beEqualTo(UserPurchasesStringsByUserIdColonAppId(UserPurchasesByUserIdAndAppId(
                "vendorUdid~vendorUdid", "appId", Set(UserPurchase(
                  "uk.co.guardian.gce.plusobserver.1monthsub",
                  "20000001746150",
                  UserPurchaseInterval("2012-09-30T12:24:36.000Z", "2012-11-06T13:24:36.000Z"))))))
              None
            }

            override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = None
          }))
    ))

    "don't delegate when no delegate" in {
      val config: Config = ConfigFactory.empty()
      val stream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client = mock[OkHttpClient]
      val mockAmazonCloudWatch = mock[AmazonCloudWatch]
      new DelegatingValidateReceiptLambda(config, validateReceiptsController, client, new CloudWatchImpl("", mockAmazonCloudWatch)).handleRequest(new ByteArrayInputStream(
        mapper.writeValueAsBytes(exampleRequest)), stream, null)
      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))
      actualResponse.copy(maybeBody = None) must beEqualTo(LambdaResponse(200, None, Map("Content-Type" -> "application/json; charset=UTF-8")))
      mapper.readValue[ValidateResponse](actualResponse.maybeBody.get) must beEqualTo(ValidateResponse(Set(ValidatedTransaction("20000034829192", 1, 1, ValidatedTransactionPurchase("uk.co.guardian.gce.plusobserver.1monthsub", "20000001746150", ValidatedTransactionPurchaseActiveInterval("2012-09-30T12:24:36.000Z", "2012-11-06T13:24:36.000Z")), 0))))
      there was no(client).newCall(Mockito.any[Request]())
    }
    "do delegate with failure of lambda" in {
      val config: Config = ConfigFactory.parseMap(Map("delegate.validatereceiptsurl" -> "http://delegate.invalid/validateReceipts").asJava)
      val stream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client = mock[OkHttpClient]
      val mockCall = mock[Call]
      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onResponse(mockCall, testOkHttpResponse(request, 200, Some(applicationJsonMediaType),
                    Some(mapper.writeValueAsBytes(ValidateResponse(Set()))), Map("headerkey" -> "headerValue")))
              }
            }
            mockCall
          }
        }

      }
      val mockAmazonCloudWatch = mock[AmazonCloudWatch]
      new DelegatingValidateReceiptLambda(config, new ValidateReceiptsController(new ValidateReceiptsRoute {
        override def route(validateReceiptRequest: ValidateRequest): Try[Set[ValidatedTransaction]] = Failure(new IllegalStateException())
      }), client, new CloudWatchImpl("", mockAmazonCloudWatch)).handleRequest(new ByteArrayInputStream(
        mapper.writeValueAsBytes(exampleRequest)), stream, null)
      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))
      val expectedResponse: LambdaResponse = LambdaResponse(200, None, Map("headerkey" -> "headerValue"))
      actualResponse.copy(maybeBody = None) must beEqualTo(expectedResponse)
      mapper.readTree(actualResponse.maybeBody.get) must beEqualTo(mapper.readTree("""{"transactions":[]}"""))
      there was one(client).newCall(any[Request]())
    }
    "constructor" in {
      new DelegatingValidateReceiptLambda() must throwA[SdkClientException]
    }
  }

}
