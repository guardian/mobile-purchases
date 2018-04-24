package com.gu.mobilepurchases.shared.cloudwatch

import java.time.{ Duration, Instant }
import java.util
import java.util.concurrent.ConcurrentLinkedQueue

import com.amazonaws.services.cloudwatch.AmazonCloudWatch
import com.amazonaws.services.cloudwatch.model.{ MetricDatum, PutMetricDataRequest, StandardUnit }

import scala.annotation.tailrec

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

  def sendABatch(bufferOfMetrics: util.ArrayList[MetricDatum]): Unit = {
    if (!bufferOfMetrics.isEmpty) {
      val request: PutMetricDataRequest = new PutMetricDataRequest()
        .withNamespace(s"mobile-purchases/$stage/$lambdaname")
        .withMetricData(bufferOfMetrics)
      cw.putMetricData(request)
    }
  }

  @tailrec
  final def sendMetricsSoFar(queue: ConcurrentLinkedQueue[MetricDatum], bufferOfMetrics: util.ArrayList[MetricDatum]): Unit = {
    val current: MetricDatum = queue.poll()
    if (current == null) {
      sendABatch(bufferOfMetrics)
    } else {
      bufferOfMetrics.add(current)
      if (bufferOfMetrics.size() > 20) {
        sendABatch(bufferOfMetrics)
        sendMetricsSoFar(queue, new util.ArrayList[MetricDatum]())
      } else {
        sendMetricsSoFar(queue, bufferOfMetrics)
      }
    }
  }

  def sendMetricsSoFar(): Unit = {
    sendMetricsSoFar(queue, new util.ArrayList[MetricDatum]())
  }

  def startTimer(metricName: String): Timer = new Timer(metricName, this)

  def meterHttpStatusResponses(metricPrefix: String, code: Int): Unit = queueMetric(s"$metricPrefix-${code / 100}xx", 1)

}
