package com.gu.mobilepurchases.shared.cloudwatch

import java.time.{ Duration, Instant }
import java.util
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.stream.Collectors

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.amazonaws.services.cloudwatch.model.{ MetricDatum, PutMetricDataRequest, StandardUnit, StatisticSet }

trait CloudWatchMetrics {
  def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit = StandardUnit.None): Boolean

  def startTimer(metricName: String): Timer

  def meterHttpStatusResponses(metricName: String, code: Int): Unit
}
trait CloudWatchPublisher {
  def sendMetricsSoFar(): Unit
}

trait CloudWatch extends CloudWatchMetrics with CloudWatchPublisher

sealed class Timer(metricName: String, cloudWatch: CloudWatchMetrics, start: Instant = Instant.now()) {
  def succeed = {
    cloudWatch.queueMetric(s"$metricName-success", Duration.between(start, Instant.now()).toMillis, StandardUnit.Milliseconds)
  }

  def fail = cloudWatch.queueMetric(s"$metricName-fail", Duration.between(start, Instant.now()).toMillis, StandardUnit.Milliseconds)

}

class CloudWatchImpl(stage: String, lambdaname: String, cw: AmazonCloudWatch) extends CloudWatch {
  val queue: ConcurrentLinkedQueue[MetricDatum] = new ConcurrentLinkedQueue[MetricDatum]()

  def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit = StandardUnit.None): Boolean = {
    queue.add(new MetricDatum()
      .withMetricName(metricName)
      .withUnit(StandardUnit.None)
      .withValue(value))
  }

  def sendMetricsSoFar(): Unit = {
    var current = queue.poll()
    while (current != null) {
      val arrayOfMetrics: util.ArrayList[MetricDatum] = new util.ArrayList[MetricDatum]()
      var index = 0
      while (index < 20 && current != null) {
        arrayOfMetrics.add(current)
        index = index + 1
        current = queue.poll()
      }
      val request: PutMetricDataRequest = new PutMetricDataRequest()
        .withNamespace(s"mobile-purchases/$stage/$lambdaname")
        .withMetricData(arrayOfMetrics)
      cw.putMetricData(request)
    }

  }

  def startTimer(metricName: String): Timer = new Timer(metricName, this)

  def meterHttpStatusResponses(metricPrefix: String, code: Int): Unit = queueMetric(s"$metricPrefix-${code / 100}xx", 1)

}
