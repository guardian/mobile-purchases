package com.gu.mobilepurchases.shared.cloudwatch

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.amazonaws.services.cloudwatch.model.PutMetricDataRequest
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

class CloudWatchImplTest extends Specification with Mockito {
  "CloudWatchImpl" should {
    "Sends all metrics" in {
      val amazonCloudWatch: AmazonCloudWatch = mock[AmazonCloudWatch]
      val cloudWatchImpl: CloudWatchImpl = new CloudWatchImpl("Stage", "LambdaName", amazonCloudWatch)

      cloudWatchImpl.queueMetric("basic-metric", 1)
      cloudWatchImpl.sendMetricsSoFar()
      there was one(amazonCloudWatch).putMetricData(any[PutMetricDataRequest]())
    }
  }

}
