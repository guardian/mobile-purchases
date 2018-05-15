package com.gu.mobilepurchases.userpurchases.lambda

import java.io.{ ByteArrayInputStream, ByteArrayOutputStream, IOException, InputStream }

import com.amazonaws.services.cloudwatch.AmazonCloudWatchAsync
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchImpl, CloudWatchImplSpec }
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.OkHttpClientTestUtils.testOkHttpResponse
import com.gu.mobilepurchases.shared.lambda.{ ApiGatewayLambdaRequest, ApiGatewayLambdaResponse, LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController
import com.gu.mobilepurchases.userpurchases.purchases.{ UserPurchasesRequest, UserPurchasesResponse }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import okhttp3.{ Call, Callback, OkHttpClient, Request }
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

class DelegateUserPurchasesLambdaSpec extends Specification with Mockito {

  "DelegateUserPurchasesLambda" should {
    val mockAmazonCloudWatch: AmazonCloudWatchAsync = CloudWatchImplSpec.mockSuccessfullySendMetrics(_ => ())
    val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("", "lambdaname", mockAmazonCloudWatch)
    val expectedApiGatewayRequest: Array[Byte] = mapper.writeValueAsBytes(
      ApiGatewayLambdaRequest(LambdaRequest(
        None,
        Map(
          "appId" -> "uk.co.guardian.iphone2",
          "userIds" -> "gnmUdid~gia:D39DE40D-CF02-4DFC-96F7-3BF6CA2C1A25,vendorUdid~DB19C9CB-5539-4BF8-B76A-44B9BEB36E22"))))
    "return lambda failure when both fail" in {

      val userPurchasesController = new UserPurchasesController((userPurchasesRequest: UserPurchasesRequest) => throw new IllegalStateException("lambda failed"), cloudWatchImpl)
      val inputStream: InputStream = new ByteArrayInputStream(expectedApiGatewayRequest)
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client: OkHttpClient = mock[OkHttpClient]
      val mockCall = mock[Call]

      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onFailure(mockCall, new IOException("Fail delegate"))
              }
            }
            mockCall
          }
        }
      }
      new DelegateUserPurchasesLambda("http://delegate.invalid/userPurhcases", userPurchasesController, client, cloudWatchImpl).handleRequest(inputStream, outputStream, null)
      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](outputStream.toByteArray))
      actualResponse.copy(maybeBody = None) must beEqualTo(LambdaResponse(500, None, Map("Content-Type" -> "text/plain; charset=UTF-8")))
    }
    val expectedLambdaResponse: UserPurchasesResponse = UserPurchasesResponse(Set(UserPurchase("lambdaProductId", "lambdaWebOrderLineItemid", UserPurchaseInterval("lambdaStart", "lambdaEnd"))))
    val expectedDelegateResponse: UserPurchasesResponse = UserPurchasesResponse(Set(UserPurchase("delegateProductId", "delegateWebOrderLineItemid", UserPurchaseInterval("delegateStart", "delegateEnd"))))
    "return lambda success when delegate fails" in {

      val userPurchasesController = new UserPurchasesController((userPurchasesRequest: UserPurchasesRequest) => expectedLambdaResponse, cloudWatchImpl)
      val inputStream: InputStream = new ByteArrayInputStream(expectedApiGatewayRequest)
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client: OkHttpClient = mock[OkHttpClient]
      val mockCall = mock[Call]

      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onFailure(mockCall, new IOException("Fail delegate"))
              }
            }
            mockCall
          }
        }
      }

      new DelegateUserPurchasesLambda("http://delegate.invalid/userPurhcases", userPurchasesController, client, cloudWatchImpl).handleRequest(inputStream, outputStream, null)
      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](outputStream.toByteArray))
      actualResponse.copy(maybeBody = None) must beEqualTo(LambdaResponse(200, None, Map("Content-Type" -> "application/json; charset=UTF-8")))
      mapper.readValue[UserPurchasesResponse](actualResponse.maybeBody.get) must beEqualTo(expectedLambdaResponse)
    }
    "return delegate when lambda fails" in {

      val userPurchasesController = new UserPurchasesController((userPurchasesRequest: UserPurchasesRequest) => throw new IllegalStateException("lambda failed"), cloudWatchImpl)
      val inputStream: InputStream = new ByteArrayInputStream(expectedApiGatewayRequest)
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client: OkHttpClient = mock[OkHttpClient]

      val mockCall = mock[Call]

      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onResponse(mockCall, testOkHttpResponse(request, 200, None, Some(mapper.writeValueAsBytes(expectedDelegateResponse)), Map("delegatekey" -> "delegatevalue")))
              }
            }
            mockCall
          }
        }
      }

      new DelegateUserPurchasesLambda("http://delegate.invalid/userPurhcases", userPurchasesController, client, cloudWatchImpl).handleRequest(inputStream, outputStream, null)
      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](outputStream.toByteArray))
      actualResponse.copy(maybeBody = None) must beEqualTo(LambdaResponse(200, None, Map("delegatekey" -> "delegatevalue")))
      mapper.readValue[UserPurchasesResponse](actualResponse.maybeBody.get) must beEqualTo(expectedDelegateResponse)
    }

    "prefer delegate over lambda" in {

      val userPurchasesController = new UserPurchasesController((userPurchasesRequest: UserPurchasesRequest) => expectedLambdaResponse, cloudWatchImpl)
      val inputStream: InputStream = new ByteArrayInputStream(expectedApiGatewayRequest)
      val outputStream: ByteArrayOutputStream = new ByteArrayOutputStream()
      val client: OkHttpClient = mock[OkHttpClient]

      val mockCall = mock[Call]

      client.newCall(any[Request]()) answers {
        (_: Any) match {
          case (request: Request) => {
            mockCall.enqueue(any[Callback]()) answers {
              (_: Any) match {
                case (callback: Callback) =>
                  callback.onResponse(mockCall, testOkHttpResponse(request, 200, None, Some(mapper.writeValueAsBytes(expectedDelegateResponse)), Map("delegatekey" -> "delegatevalue")))
              }
            }
            mockCall
          }
        }
      }

      new DelegateUserPurchasesLambda("http://delegate.invalid/userPurhcases", userPurchasesController, client, cloudWatchImpl).handleRequest(inputStream, outputStream, null)
      val actualResponse: LambdaResponse = LambdaResponse(mapper.readValue[ApiGatewayLambdaResponse](outputStream.toByteArray))
      actualResponse.copy(maybeBody = None) must beEqualTo(LambdaResponse(200, None, Map("delegatekey" -> "delegatevalue")))
      mapper.readValue[UserPurchasesResponse](actualResponse.maybeBody.get) must beEqualTo(expectedDelegateResponse)

    }
  }

}
