package com.gu.mobilepurchases.shared.cloudwatch

import java.util.concurrent.CompletableFuture
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification
import org.specs2.specification.mutable.SpecificationFeatures
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient
import software.amazon.awssdk.services.cloudwatch.model.{MetricDatum, PutMetricDataRequest, PutMetricDataResponse, StandardUnit}
import scala.concurrent.ExecutionContext

object CloudWatchImplSpec extends SpecificationFeatures with Mockito {
  implicit val ec: ExecutionContext = ExecutionContext.global

  def mockSuccessfullySendMetrics(assertPutMetricDataRequest: PutMetricDataRequest => Unit): CloudWatchAsyncClient = {
    val cloudWatchClient = mock[CloudWatchAsyncClient]
    cloudWatchClient.putMetricData(any[PutMetricDataRequest]()) answers { request: Any =>
      val req = request.asInstanceOf[PutMetricDataRequest]
      assertPutMetricDataRequest(req)
      CompletableFuture.completedFuture(PutMetricDataResponse.builder().build())
    }
    cloudWatchClient
  }
}

class CloudWatchImplSpec extends Specification with Mockito {

  implicit val ec: ExecutionContext = ExecutionContext.global

  "CloudWatchImpl" should {

    "send basic metric" in {
      def assertRequest(request: PutMetricDataRequest): Unit = {
        val datum: MetricDatum = request.metricData().iterator().next()
        datum.metricName() must beEqualTo("basic-metric")
        datum.unit() must beEqualTo(StandardUnit.COUNT)
        datum.value().doubleValue() must beEqualTo(1d)
      }

      val client = CloudWatchImplSpec.mockSuccessfullySendMetrics(assertRequest)
      val cloudWatch = new CloudWatchImpl("Stage", "LambdaName", client)

      cloudWatch.queueMetric("basic-metric", 1, StandardUnit.COUNT)
      cloudWatch.sendMetricsSoFar()

      there was one(client).putMetricData(any[PutMetricDataRequest]())
    }

    "meter HTTP responses" in {
      def assertRequest(request: PutMetricDataRequest): Unit = {
        val datum: MetricDatum = request.metricData().iterator().next()
        datum.metricName() must beEqualTo("http-3xx")
        datum.unit() must beEqualTo(StandardUnit.COUNT)
        datum.value().doubleValue() must beEqualTo(1d)
      }

      val client = CloudWatchImplSpec.mockSuccessfullySendMetrics(assertRequest)
      val cloudWatch = new CloudWatchImpl("Stage", "LambdaName", client)

      cloudWatch.meterHttpStatusResponses("http", 303)
      cloudWatch.sendMetricsSoFar()

      there was one(client).putMetricData(any[PutMetricDataRequest]())
    }

    "timer metrics" in {
      def assertRequest(request: PutMetricDataRequest): Unit = {
        val datum: MetricDatum = request.metricData().iterator().next()
        datum.metricName() must beEqualTo("Timer-success")
        datum.unit() must beEqualTo(StandardUnit.MILLISECONDS)
        datum.value().doubleValue() must be_>(1d)
      }

      val client = CloudWatchImplSpec.mockSuccessfullySendMetrics(assertRequest)
      val cloudWatch = new CloudWatchImpl("Stage", "LambdaName", client)

      val timer = cloudWatch.startTimer("Timer")
      Thread.sleep(250)
      timer.succeed
      cloudWatch.sendMetricsSoFar()

      there was one(client).putMetricData(any[PutMetricDataRequest]())
    }

  }

}
