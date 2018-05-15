package com.gu.mobilepurchases.lambda

import java.io.{ ByteArrayInputStream, ByteArrayOutputStream }
import java.time.Clock.systemUTC
import java.time.ZoneOffset.UTC
import java.time.{ Clock, Duration, ZonedDateTime }
import java.util.concurrent.TimeUnit

import com.amazonaws.services.cloudwatch.AmazonCloudWatchAsync
import com.gu.mobilepurchases.apple.AppStoreExample.successAsAppStoreResponse
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionPurchaseActiveInterval }
import com.gu.mobilepurchases.persistence.{ TransactionPersistenceImpl, UserPurchaseFilterExpiredImpl }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchImpl, CloudWatchImplSpec }
import com.gu.mobilepurchases.shared.external.GlobalOkHttpClient.applicationJsonMediaType
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.OkHttpClientTestUtils.testOkHttpResponse
import com.gu.mobilepurchases.shared.external.Parallelism
import com.gu.mobilepurchases.shared.lambda.{ ApiGatewayLambdaRequest, ApiGatewayLambdaResponse, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.persistence.{ ScanamaoUserPurchasesStringsByUserIdColonAppId, UserPurchasePersistenceImpl, UserPurchasePersistenceTransformer, UserPurchasesByUserIdAndAppId, UserPurchasesStringsByUserIdColonAppId }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.mobilepurchases.validate.ValidateExample.successValidateRequest
import com.gu.mobilepurchases.validate.{ FetchAppStoreResponsesImpl, ValidateExample, ValidateReceiptsController, ValidateReceiptsRouteImpl, ValidateReceiptsTransformAppStoreResponseImpl, ValidateRequest, ValidateResponse }
import com.gu.scanamo.error.DynamoReadError
import com.gu.scanamo.query.UniqueKey
import com.typesafe.config.{ Config, ConfigFactory }
import okhttp3.{ Call, Callback, OkHttpClient, Request }
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.collection.JavaConverters._
import scala.concurrent.{ ExecutionContext, Future, duration }
import scala.util.Failure

class DelegatingValidateReceiptLambdaSpec extends Specification with Mockito {

  implicit val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext
  "DelegatingValidateReceiptLambda" should {
    val clock: Clock = Clock.offset(systemUTC(), Duration.between(ZonedDateTime.now(UTC), ZonedDateTime.parse("2012-11-06T13:24:36.000Z").minusHours(2)))
    val userPurchasePersistenceTransformer: UserPurchasePersistenceTransformer = new UserPurchasePersistenceTransformer(clock)
    val mockAmazonCloudWatch: AmazonCloudWatchAsync = CloudWatchImplSpec.mockSuccessfullySendMetrics(_ => ())
    val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("", "lambdaname", mockAmazonCloudWatch)
    val expectedApiGatewayRequest: Array[Byte] = mapper.writeValueAsBytes(
      ApiGatewayLambdaRequest(LambdaRequest(Some(mapper.writeValueAsString(successValidateRequest)), Map())))
    val expectedUserPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId = userPurchasePersistenceTransformer.transform(
      UserPurchasesByUserIdAndAppId(
        s"vendorUdid~${successValidateRequest.userIds.vendorUdid}", successValidateRequest.appInfo.id, Set(UserPurchase(
          "uk.co.guardian.gce.plusobserver.1monthsub",
          "20000001746150",
          UserPurchaseInterval("2012-09-30T12:24:36.000Z", "2012-11-06T13:24:36.000Z")))))

    val fetchAppStoreResponsesImpl: FetchAppStoreResponsesImpl = new FetchAppStoreResponsesImpl(
      (receiptData: String) => {
        Set(ValidateExample.successValidateRequestTransaction.receipt, successAsAppStoreResponse.latest_receipt.get) must contain(receiptData)
        Future.successful {
          successAsAppStoreResponse
        }
      },
      cloudWatchImpl, duration.Duration(1, TimeUnit.MINUTES))

    val userPurchasePersistenceImpl: UserPurchasePersistenceImpl = new UserPurchasePersistenceImpl(
      new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(
          userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId
        ): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          userPurchasesStringsByUserIdColonAppId.copy(ttl = 0) must beEqualTo(expectedUserPurchasesStringsByUserIdColonAppId.copy(ttl = 0))
          None
        }

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = None
      }, userPurchasePersistenceTransformer, cloudWatchImpl)

    val validateReceiptsController: ValidateReceiptsController = new ValidateReceiptsController(new ValidateReceiptsRouteImpl(
      new ValidateReceiptsTransformAppStoreResponseImpl(),
      fetchAppStoreResponsesImpl, new TransactionPersistenceImpl(
        userPurchasePersistenceImpl, new UserPurchaseFilterExpiredImpl(clock))
    ), cloudWatchImpl)

    "don't delegate when no delegate" in {
      val config: Config = ConfigFactory.empty()
      val stream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client = mock[OkHttpClient]
      new DelegatingValidateReceiptLambda(config, validateReceiptsController, client, cloudWatchImpl)
        .handleRequest(new ByteArrayInputStream(expectedApiGatewayRequest), stream, null)

      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))

      actualResponse.copy(maybeBody = None) must beEqualTo(LambdaResponse(200, None, Map("Content-Type" -> "application/json; charset=UTF-8")))
      mapper.readValue[ValidateResponse](actualResponse.maybeBody.get) must beEqualTo(ValidateResponse(Set(
        ValidatedTransaction("20000034829192", 1, 1,
          Some(ValidatedTransactionPurchase("uk.co.guardian.gce.plusobserver.1monthsub", "20000001746150", ValidatedTransactionPurchaseActiveInterval("2012-09-30T12:24:36.000Z", "2012-11-06T13:24:36.000Z"))), 0))))
      there was no(client).newCall(Mockito.any[Request]())
    }

    "don't delegate when delegate failure" in {
      val config: Config = ConfigFactory.parseMap(Map("delegate.insecurevalidatereceiptsurl" -> "http://delegate.invalid/validateReceipts").asJava)
      val stream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client = mock[OkHttpClient]
      val mockCall = mock[Call]

      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onResponse(mockCall, testOkHttpResponse(request, 500, None, None, Map()))
              }
            }
            mockCall
          }
        }
      }

      new DelegatingValidateReceiptLambda(config, validateReceiptsController,
        client,
        cloudWatchImpl
      ).handleRequest(new ByteArrayInputStream(expectedApiGatewayRequest), stream, null)

      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))
      val expectedResponse: LambdaResponse = LambdaResponse(200, None, Map("Content-Type" -> "application/json; charset=UTF-8"))
      actualResponse.copy(maybeBody = None) must beEqualTo(expectedResponse)
      mapper.readValue[ValidateResponse](actualResponse.maybeBody.get) must beEqualTo(ValidateResponse(Set(ValidatedTransaction("20000034829192", 1, 1, Some(ValidatedTransactionPurchase("uk.co.guardian.gce.plusobserver.1monthsub", "20000001746150", ValidatedTransactionPurchaseActiveInterval("2012-09-30T12:24:36.000Z", "2012-11-06T13:24:36.000Z"))), 0))))
      there was one(client).newCall(any[Request]())
    }

    "do delegate with failure of lambda" in {
      val config: Config = ConfigFactory.parseMap(Map("delegate.insecurevalidatereceiptsurl" -> "http://delegate.invalid/validateReceipts").asJava)
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

      new DelegatingValidateReceiptLambda(config, new ValidateReceiptsController(
        (validateReceiptRequest: ValidateRequest) => Failure(new IllegalStateException()), cloudWatchImpl),
        client,
        cloudWatchImpl
      ).handleRequest(new ByteArrayInputStream(expectedApiGatewayRequest), stream, null)

      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))
      val expectedResponse: LambdaResponse = LambdaResponse(200, None, Map("headerkey" -> "headerValue"))
      actualResponse.copy(maybeBody = None) must beEqualTo(expectedResponse)
      mapper.readTree(actualResponse.maybeBody.get) must beEqualTo(mapper.readTree("""{"transactions":[]}"""))
      there was one(client).newCall(any[Request]())
    }

    "prioritise lambda over delegate when when more results" in {
      val config: Config = ConfigFactory.parseMap(Map("delegate.insecurevalidatereceiptsurl" -> "http://delegate.invalid/validateReceipts").asJava)
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

      new DelegatingValidateReceiptLambda(config, validateReceiptsController,
        client,
        cloudWatchImpl
      ).handleRequest(new ByteArrayInputStream(expectedApiGatewayRequest), stream, null)

      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))
      val expectedResponse: LambdaResponse = LambdaResponse(200, None, Map("Content-Type" -> "application/json; charset=UTF-8"))
      actualResponse.copy(maybeBody = None) must beEqualTo(expectedResponse)
      mapper.readValue[ValidateResponse](actualResponse.maybeBody.get) must beEqualTo(ValidateResponse(Set(ValidatedTransaction("20000034829192", 1, 1, Some(ValidatedTransactionPurchase("uk.co.guardian.gce.plusobserver.1monthsub", "20000001746150", ValidatedTransactionPurchaseActiveInterval("2012-09-30T12:24:36.000Z", "2012-11-06T13:24:36.000Z"))), 0))))
      there was one(client).newCall(any[Request]())
    }

    "prioritise delegate over  lambda when when more results" in {
      val config: Config = ConfigFactory.parseMap(Map("delegate.insecurevalidatereceiptsurl" -> "http://delegate.invalid/validateReceipts").asJava)
      val stream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client = mock[OkHttpClient]
      val mockCall = mock[Call]
      val delegateTransactions: Set[ValidatedTransaction] = Set(ValidateExample.successValidatedTransaction, ValidateExample.successValidatedTransaction.copy(appStoreStatusResponse = -1))
      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onResponse(mockCall, testOkHttpResponse(request, 200, Some(applicationJsonMediaType),
                    Some(mapper.writeValueAsBytes(ValidateResponse(delegateTransactions))), Map("headerkey" -> "headerValue")))
              }
            }
            mockCall
          }
        }
      }

      new DelegatingValidateReceiptLambda(config, validateReceiptsController,
        client,
        cloudWatchImpl
      ).handleRequest(new ByteArrayInputStream(expectedApiGatewayRequest), stream, null)

      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](stream.toByteArray))
      val expectedResponse: LambdaResponse = LambdaResponse(200, None, Map("headerkey" -> "headerValue"))
      actualResponse.copy(maybeBody = None) must beEqualTo(expectedResponse)
      mapper.readValue[ValidateResponse](actualResponse.maybeBody.get) must beEqualTo(ValidateResponse(delegateTransactions))
      there was one(client).newCall(any[Request]())
    }

    "deafult constructor fails without config" in {
      new DelegatingValidateReceiptLambda() must throwA[Exception]
    }
  }

}
