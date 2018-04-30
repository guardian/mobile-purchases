package com.gu.mobilepurchases.shared.cloudwatch

import java.util
import java.util.concurrent.{ CompletableFuture, Future }

import com.amazonaws.handlers.AsyncHandler
import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchAsync }
import com.amazonaws.services.cloudwatch.model.{ MetricDatum, PutMetricDataRequest, PutMetricDataResult, StandardUnit }
import org.mockito.ArgumentCaptor
import org.specs2.mock.Mockito
import org.specs2.mock.mockito.ArgumentCapture
import org.specs2.mutable.Specification
import org.specs2.specification.mutable.SpecificationFeatures

object CloudWatchImplSpec extends SpecificationFeatures with Mockito {
  def mockSuccessfullySendMetrics(assertPutMetricDataRequest: (PutMetricDataRequest => Unit)): AmazonCloudWatchAsync = {
    val amazonCloudWatch: AmazonCloudWatchAsync = mock[AmazonCloudWatchAsync]
    val requestCaptor: ArgumentCaptor[PutMetricDataRequest] = ArgumentCaptor.forClass(classOf[PutMetricDataRequest])
    val asyncCaptor: ArgumentCaptor[AsyncHandler[PutMetricDataRequest, PutMetricDataResult]] = ArgumentCaptor.forClass(classOf[AsyncHandler[PutMetricDataRequest, PutMetricDataResult]])
    val putMetricDataResult: PutMetricDataResult = mock[PutMetricDataResult]
    amazonCloudWatch.putMetricDataAsync(requestCaptor.capture(), asyncCaptor.capture()) responds {
      case (_: Any) => {
        val request: PutMetricDataRequest = requestCaptor.getValue
        asyncCaptor.getValue.onSuccess(request, putMetricDataResult)
        assertPutMetricDataRequest(request)
        CompletableFuture.completedFuture(putMetricDataResult)
      }
    }
    amazonCloudWatch
  }
}

class CloudWatchImplSpec extends Specification with Mockito {
  "CloudWatchImpl" should {
    "Sends basic metric" in {

      def assertPutMetricDataRequest(request: PutMetricDataRequest): Unit = {
        val metricData: util.List[MetricDatum] = request.getMetricData
        metricData.size() must beEqualTo(1)
        val datum: MetricDatum = metricData.get(0)
        datum.getMetricName must beEqualTo("basic-metric")
        datum.getUnit must beEqualTo(StandardUnit.Count.toString)
        datum.getValue.doubleValue() must beEqualTo(1d)
      }
      val amazonCloudWatch: AmazonCloudWatchAsync = CloudWatchImplSpec.mockSuccessfullySendMetrics(assertPutMetricDataRequest)
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("Stage", "LambdaName", amazonCloudWatch)

      cloudWatchImpl.queueMetric("basic-metric", 1, StandardUnit.Count)
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricDataAsync(any[PutMetricDataRequest](), any[AsyncHandler[PutMetricDataRequest, PutMetricDataResult]]())
    }
    "Meter Http" in {
      def assertPutMetricDataRequest(putMetricDataRequest: PutMetricDataRequest): Unit = {
        val metricData: util.List[MetricDatum] = putMetricDataRequest.getMetricData
        metricData.size() must beEqualTo(1)
        val datum: MetricDatum = metricData.get(0)
        datum.getMetricName must beEqualTo("http-3xx")
        datum.getUnit must beEqualTo(StandardUnit.Count.toString)
        datum.getValue.doubleValue() must beEqualTo(1d)

      }
      val amazonCloudWatch: AmazonCloudWatchAsync = CloudWatchImplSpec.mockSuccessfullySendMetrics(assertPutMetricDataRequest)
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("Stage", "LambdaName", amazonCloudWatch)

      cloudWatchImpl.meterHttpStatusResponses("http", 303)
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricDataAsync(any[PutMetricDataRequest](), any[AsyncHandler[PutMetricDataRequest, PutMetricDataResult]]())
    }
    "Timer" in {
      def assertPutMetricDataRequest(putMetricDataRequest: PutMetricDataRequest): Unit = {
        val metricData: util.List[MetricDatum] = putMetricDataRequest.getMetricData
        metricData.size() must beEqualTo(1)
        val datum: MetricDatum = metricData.get(0)
        datum.getMetricName must beEqualTo("Timer-success")

        datum.getUnit must beEqualTo(StandardUnit.Milliseconds.toString)
        datum.getValue.doubleValue() must be_>(1d)
      }
      val amazonCloudWatch: AmazonCloudWatchAsync = CloudWatchImplSpec.mockSuccessfullySendMetrics(assertPutMetricDataRequest)
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("stage", "lambdaname", amazonCloudWatch)

      val timer: Timer = cloudWatchImpl.startTimer("Timer")
      Thread.sleep(250)
      timer.succeed
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricDataAsync(any[PutMetricDataRequest](), any[AsyncHandler[PutMetricDataRequest, PutMetricDataResult]]())
    }

  }

}
