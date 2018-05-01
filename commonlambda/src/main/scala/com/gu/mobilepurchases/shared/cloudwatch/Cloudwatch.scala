package com.gu.mobilepurchases.shared.cloudwatch

import java.time.{ Duration, Instant }
import java.util
import java.util.Date
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.{ ConcurrentLinkedQueue, TimeUnit }

import com.amazonaws.handlers.AsyncHandler
import com.amazonaws.services.cloudwatch.AmazonCloudWatchAsync
import com.amazonaws.services.cloudwatch.model.{ MetricDatum, PutMetricDataRequest, PutMetricDataResult, StandardUnit }
import com.gu.mobilepurchases.shared.external.Parallelism
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.annotation.tailrec
import scala.concurrent.{ Await, ExecutionContext, Future, Promise, duration }

trait CloudWatchMetrics {
  def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit, instant: Instant = Instant.now()): Boolean

  def startTimer(metricName: String): Timer

  def meterHttpStatusResponses(metricName: String, code: Int): Unit
}

trait CloudWatchPublisher {
  def sendMetricsSoFar(): Unit
}

trait CloudWatch extends CloudWatchMetrics with CloudWatchPublisher

sealed class Timer(metricName: String, cloudWatch: CloudWatchMetrics, start: Instant = Instant.now()) {
  def succeed = cloudWatch.queueMetric(s"$metricName-success", Duration.between(start, Instant.now()).toMillis, StandardUnit.Milliseconds, start)
  def fail = cloudWatch.queueMetric(s"$metricName-fail", Duration.between(start, Instant.now()).toMillis, StandardUnit.Milliseconds, start)

}

class CloudWatchImpl(stage: String, lambdaname: String, cw: AmazonCloudWatchAsync) extends CloudWatch {
  private val atomicLong: AtomicLong = new AtomicLong(0)
  private val logger: Logger = LogManager.getLogger(classOf[CloudWatchImpl])
  implicit private val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext
  private val queue: ConcurrentLinkedQueue[MetricDatum] = new ConcurrentLinkedQueue[MetricDatum]()

  def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit, instant: Instant): Boolean = {

    queue.add(new MetricDatum()
      .withTimestamp(Date.from(instant))
      .withMetricName(metricName)
      .withUnit(standardUnit)
      .withValue(value))
  }

  def sendABatch(bufferOfMetrics: util.ArrayList[MetricDatum]): Option[Future[PutMetricDataResult]] = {

    if (!bufferOfMetrics.isEmpty) {
      val batchNumber: Long = atomicLong.incrementAndGet()
      val request: PutMetricDataRequest = new PutMetricDataRequest()
        .withNamespace(s"mobile-purchases/$stage/$lambdaname")
        .withMetricData(bufferOfMetrics)
      val promise: Promise[PutMetricDataResult] = Promise[PutMetricDataResult]
      val value: AsyncHandler[PutMetricDataRequest, PutMetricDataResult] = new AsyncHandler[PutMetricDataRequest, PutMetricDataResult] {
        override def onError(exception: Exception): Unit = promise.failure(exception)
        override def onSuccess(request: PutMetricDataRequest, result: PutMetricDataResult): Unit = {

          promise.success(result)
        }
      }
      cw.putMetricDataAsync(request, value)
      Some(promise.future)
    } else {
      None
    }

  }

  @tailrec
  final def sendMetricsSoFar(
    queue: ConcurrentLinkedQueue[MetricDatum],
    bufferOfMetrics: util.ArrayList[MetricDatum],
    eventuallySentSoFar: Seq[Option[Future[PutMetricDataResult]]]): Seq[Option[Future[PutMetricDataResult]]] = {
    val current: MetricDatum = queue.poll()
    if (current == null) {
      eventuallySentSoFar :+ sendABatch(bufferOfMetrics)
    } else {
      bufferOfMetrics.add(current)
      if (bufferOfMetrics.size() >= 20) {
        sendMetricsSoFar(queue, new util.ArrayList[MetricDatum](), eventuallySentSoFar :+ sendABatch(bufferOfMetrics))
      } else {
        sendMetricsSoFar(queue, bufferOfMetrics, eventuallySentSoFar)
      }
    }
  }

  def sendMetricsSoFar(): Unit = {
    val eventualSeq: Future[Seq[PutMetricDataResult]] = Future.sequence(sendMetricsSoFar(queue, new util.ArrayList[MetricDatum](), Seq()).flatten)
    Await.ready(eventualSeq, duration.Duration(30, TimeUnit.SECONDS))
  }

  def startTimer(metricName: String): Timer = new Timer(metricName, this)

  def meterHttpStatusResponses(metricPrefix: String, code: Int): Unit = queueMetric(s"$metricPrefix-${code / 100}xx", 1, StandardUnit.Count)

}
