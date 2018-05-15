package com.gu.mobilepurchases.userpurchases.persistence

import java.time.{ Clock, Instant, ZoneOffset }

import com.amazonaws.services.cloudwatch.model.StandardUnit
import com.amazonaws.services.dynamodbv2.model._
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatchMetrics, Timer }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.scanamo.error.{ DynamoReadError, MissingProperty }
import com.gu.scanamo.query.UniqueKey
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.util.{ Failure, Success }

class UserPurchasePersistenceImplSpec extends Specification with Mockito {
  val instant = Instant.now()
  "UserPurchasePersistenceImpl" should {
    val cloudWatchMetrics: CloudWatchMetrics = new CloudWatchMetrics {
      override def queueMetric(metricName: String, value: Double, standardUnit: StandardUnit, instant: Instant): Boolean = ???

      override def startTimer(metricName: String): Timer = mock[Timer]

      override def meterHttpStatusResponses(metricName: String, code: Int): Unit = ???
    }
    val purchase: UserPurchase = UserPurchase(
      "testProductId", "testWebOrderLineItemId", UserPurchaseInterval("testStart", "2018-04-26T11:58:01.000Z")
    )
    val userPurchasesByUserIdAndAppId: UserPurchasesByUserIdAndAppId = UserPurchasesByUserIdAndAppId("testUserId", "testAppId", Set(purchase))
    "write success" in {

      val userPurchasePersistenceTransformer = new UserPurchasePersistenceTransformer()

      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          userPurchasesStringsByUserIdColonAppId must beEqualTo(userPurchasePersistenceTransformer.transform(userPurchasesByUserIdAndAppId))
          None
        }

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = None
      }, userPurchasePersistenceTransformer, cloudWatchMetrics).write(userPurchasesByUserIdAndAppId) must beEqualTo(Success(None))
    }
    "write fail" in {

      val userPurchasePersistenceTransformer = new UserPurchasePersistenceTransformer()
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          userPurchasesStringsByUserIdColonAppId must beEqualTo(userPurchasePersistenceTransformer.transform(userPurchasesByUserIdAndAppId))
          Some(Left(MissingProperty))
        }

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = None

      }, userPurchasePersistenceTransformer, cloudWatchMetrics).write(userPurchasesByUserIdAndAppId) must beAnInstanceOf[Failure[_]]
    }

    "read success" in {

      val userPurchasePersistenceTransformer = new UserPurchasePersistenceTransformer()
      val userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId = userPurchasePersistenceTransformer.transform(userPurchasesByUserIdAndAppId)
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(t: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = ???

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          key.asAVMap must beEqualTo(Map("userIdColonAppId" -> new AttributeValue("testUserId:testAppId")))
          Some(Right(userPurchasesStringsByUserIdColonAppId))
        }
      }, userPurchasePersistenceTransformer, cloudWatchMetrics).read("testUserId", "testAppId") must beEqualTo(Success(Some(userPurchasesByUserIdAndAppId)))
    }
    "read failure" in {

      val userPurchasePersistenceTransformer = new UserPurchasePersistenceTransformer()
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(t: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = ???

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          key.asAVMap must beEqualTo(Map("userIdColonAppId" -> new AttributeValue("testUserId:testAppId")))
          Some(Left(MissingProperty))
        }
      }, userPurchasePersistenceTransformer, cloudWatchMetrics).read("testUserId", "testAppId") must beAnInstanceOf[Failure[_]]
    }
  }

  private def buildMockClock: Clock = {
    val mockClock = mock[Clock]
    mockClock.instant() returns instant
    mockClock.getZone() returns ZoneOffset.UTC
    mockClock
  }
}
