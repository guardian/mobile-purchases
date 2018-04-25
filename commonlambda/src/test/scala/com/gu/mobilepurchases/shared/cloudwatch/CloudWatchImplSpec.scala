package com.gu.mobilepurchases.shared.cloudwatch

import java.util

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.amazonaws.services.cloudwatch.model.{ MetricDatum, PutMetricDataRequest, StandardUnit }
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

class CloudWatchImplSpec extends Specification with Mockito {
  "CloudWatchImpl" should {
    "Sends basic metric" in {
      val amazonCloudWatch: AmazonCloudWatch = mock[AmazonCloudWatch]
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("Stage", "LambdaName", amazonCloudWatch)
      amazonCloudWatch.putMetricData(any[PutMetricDataRequest]()) responds {
        case (putMetricDataRequest: PutMetricDataRequest) => {
          val metricData: util.List[MetricDatum] = putMetricDataRequest.getMetricData
          metricData.size() must beEqualTo(1)
          val datum: MetricDatum = metricData.get(0)
          datum.getMetricName must beEqualTo("basic-metric")

          datum.getUnit must beEqualTo(StandardUnit.Count.toString)
          datum.getValue.doubleValue() must beEqualTo(1d)
          null
        }
      }
      cloudWatchImpl.queueMetric("basic-metric", 1, StandardUnit.Count)
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricData(any[PutMetricDataRequest]())
    }
    "Meter Http" in {
      val amazonCloudWatch: AmazonCloudWatch = mock[AmazonCloudWatch]
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("Stage", "LambdaName", amazonCloudWatch)
      amazonCloudWatch.putMetricData(any[PutMetricDataRequest]()) responds {
        case (putMetricDataRequest: PutMetricDataRequest) => {
          val metricData: util.List[MetricDatum] = putMetricDataRequest.getMetricData
          metricData.size() must beEqualTo(1)
          val datum: MetricDatum = metricData.get(0)
          datum.getMetricName must beEqualTo("http-3xx")

          datum.getUnit must beEqualTo(StandardUnit.Count.toString)
          datum.getValue.doubleValue() must beEqualTo(1d)
          null
        }
      }
      cloudWatchImpl.meterHttpStatusResponses("http", 303)
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricData(any[PutMetricDataRequest]())
    }
    "Timer" in {
      val amazonCloudWatch: AmazonCloudWatch = mock[AmazonCloudWatch]
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("stage", "lambdaname", amazonCloudWatch)

      amazonCloudWatch.putMetricData(any[PutMetricDataRequest]()) responds {
        case (putMetricDataRequest: PutMetricDataRequest) => {
          val metricData: util.List[MetricDatum] = putMetricDataRequest.getMetricData
          metricData.size() must beEqualTo(1)
          val datum: MetricDatum = metricData.get(0)
          datum.getMetricName must beEqualTo("Timer-success")

          datum.getUnit must beEqualTo(StandardUnit.Milliseconds.toString)
          datum.getValue.doubleValue() must be_>(1d)
          null
        }
      }
      val timer: Timer = cloudWatchImpl.startTimer("Timer")
      Thread.sleep(250)
      timer.succeed
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricData(any[PutMetricDataRequest]())
    }

  }

}
