package com.gu.mobilepurchases.shared.cloudwatch

import java.time.{ Duration, Instant }
import java.util
import java.util.concurrent.ConcurrentLinkedQueue

import com.amazonaws.services.cloudwatch.model.{ MetricDatum, PutMetricDataRequest, StandardUnit }
import com.amazonaws.services.cloudwatch.{ AmazonCloudWatch, AmazonCloudWatchClientBuilder }

trait CloudWatch {
  def queueMetric(metricName: String, value: Double): Boolean

  def sendMetricsSoFar(): Unit
  def startTimer(metricName: String): Timer
  def meterHttpStatusResponses(metricName: String, code: Int): Unit
}
sealed class Timer(metricName: String, cloudWatch: CloudWatch, start: Instant = Instant.now()) {
  def succeed = {
    cloudWatch.queueMetric(s"$metricName-success", Duration.between(Instant.now(), start).toMillis)
  }
  def fail = cloudWatch.queueMetric(s"$metricName-fail", Duration.between(Instant.now(), start).toMillis)

}
class CloudWatchImpl(stage: String, cw: AmazonCloudWatch = AmazonCloudWatchClientBuilder.defaultClient()) extends CloudWatch {
  val queue: ConcurrentLinkedQueue[MetricDatum] = new ConcurrentLinkedQueue[MetricDatum]()

  def queueMetric(metricName: String, value: Double): Boolean = {
    queue.add(new MetricDatum()
      .withMetricName(metricName)
      .withUnit(StandardUnit.None)
      .withValue(value))
  }

  def sendMetricsSoFar(): Unit = {
    val arrayOfMetrics: util.ArrayList[MetricDatum] = new util.ArrayList[MetricDatum]()
    queue.removeAll(arrayOfMetrics)
    cw.putMetricData(new PutMetricDataRequest().withMetricData(arrayOfMetrics))
  }
  def startTimer(metricName: String): Timer = new Timer(metricName, this)
  def meterHttpStatusResponses(metricPrefix: String, code: Int): Unit = queueMetric(s"$metricPrefix-${code % 100}xx", 1)

}
