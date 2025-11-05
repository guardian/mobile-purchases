package com.gu.mobilepurchases.shared.cloudwatch

import java.time.{Duration, Instant}
import java.util
import java.util.concurrent.{CompletableFuture, ConcurrentLinkedQueue}
import software.amazon.awssdk.services.cloudwatch.CloudWatchAsyncClient
import software.amazon.awssdk.services.cloudwatch.model.{
  MetricDatum,
  PutMetricDataRequest,
  PutMetricDataResponse,
  StandardUnit
}
import scala.compat.java8.FutureConverters._
import com.gu.mobilepurchases.shared.external.Parallelism
import org.apache.logging.log4j.{LogManager, Logger}
import scala.annotation.tailrec
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._

trait CloudWatchMetrics {
  def queueMetric(
      metricName: String,
      value: Double,
      standardUnit: StandardUnit,
      instant: Instant = Instant.now()
  ): Boolean

  def startTimer(metricName: String): Timer

  def meterHttpStatusResponses(metricName: String, code: Int): Unit
}

trait CloudWatchPublisher {
  def sendMetricsSoFar(): Unit
}

trait CloudWatch extends CloudWatchMetrics with CloudWatchPublisher

sealed class Timer(metricName: String, cloudWatch: CloudWatchMetrics, start: Instant = Instant.now()) {
  def succeed: Boolean = cloudWatch.queueMetric(
    s"$metricName-success",
    Duration.between(start, Instant.now()).toMillis.toDouble,
    StandardUnit.MILLISECONDS,
    start
  )

  def fail: Boolean = cloudWatch.queueMetric(
    s"$metricName-fail",
    Duration.between(start, Instant.now()).toMillis.toDouble,
    StandardUnit.MILLISECONDS,
    start
  )
}

class CloudWatchImpl(stage: String, lambdaname: String, cw: CloudWatchAsyncClient) extends CloudWatch {

  private val logger: Logger = LogManager.getLogger(classOf[CloudWatchImpl])
  implicit private val ec: ExecutionContext = Parallelism.largeGlobalExecutionContext
  private val queue: ConcurrentLinkedQueue[MetricDatum] = new ConcurrentLinkedQueue[MetricDatum]()

  def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit, instant: Instant): Boolean = {
    queue.add(
      MetricDatum
        .builder()
        .metricName(metricName)
        .timestamp(instant)
        .unit(standardUnit)
        .value(value)
        .build()
    )
    true
  }

  private def sendABatch(
      bufferOfMetrics: util.ArrayList[MetricDatum]
  ): Option[Future[PutMetricDataResponse]] = {
    if (!bufferOfMetrics.isEmpty) {
      val request = PutMetricDataRequest
        .builder()
        .namespace(s"mobile-purchases/$stage/$lambdaname")
        .metricData(bufferOfMetrics) // <- Java List directly
        .build()

      val javaFuture: CompletableFuture[PutMetricDataResponse] = cw.putMetricData(request)
      Some(javaFuture.toScala) // Using toScala from FutureConverters
    } else {
      None
    }
  }

  @tailrec
  private final def sendMetricsSoFar(
      queue: ConcurrentLinkedQueue[MetricDatum],
      bufferOfMetrics: util.ArrayList[MetricDatum],
      eventuallySentSoFar: Seq[Option[Future[PutMetricDataResponse]]]
  ): Seq[Option[Future[PutMetricDataResponse]]] = {
    val current = queue.poll()
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
    val batchFutures = sendMetricsSoFar(queue, new util.ArrayList[MetricDatum](), Seq())

    // Extract and flatten the futures
    val futures: Seq[Future[PutMetricDataResponse]] = batchFutures.collect { case Some(future) =>
      future
    }

    // Wait for all batches to complete
    if (futures.nonEmpty) {
      val allBatches = Future.sequence(futures)
      Await.result(allBatches, 30.seconds)
    }
  }

  def startTimer(metricName: String): Timer = new Timer(metricName, this)

  def meterHttpStatusResponses(metricPrefix: String, code: Int): Unit =
    queueMetric(s"$metricPrefix-${code / 100}xx", 1, StandardUnit.COUNT)

}
