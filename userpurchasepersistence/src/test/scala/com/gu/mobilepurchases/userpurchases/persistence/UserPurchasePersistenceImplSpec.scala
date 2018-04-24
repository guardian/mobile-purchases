package com.gu.mobilepurchases.userpurchases.persistence

import com.amazonaws.services.dynamodbv2.model._
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.scanamo.error.{ DynamoReadError, MissingProperty }
import com.gu.scanamo.query.UniqueKey
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.util.{ Failure, Success }

class UserPurchasePersistenceImplSpec extends Specification with Mockito {
  "UserPurchasePersistenceImpl" should {
    val purchase: UserPurchase = UserPurchase(
      "testProductId", "testWebOrderLineItemId", UserPurchaseInterval("testStart", "testEnd")
    )
    val userPurchasesByUserIdAndAppId: UserPurchasesByUserIdAndAppId = UserPurchasesByUserIdAndAppId("testUserId", "testAppId", Set(purchase))
    "write success" in {
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          userPurchasesStringsByUserIdColonAppId must beEqualTo(UserPurchasesStringsByUserIdColonAppId(userPurchasesByUserIdAndAppId))
          None
        }

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = None
      }).write(userPurchasesByUserIdAndAppId) must beEqualTo(Success(None))
    }
    "write fail" in {
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          userPurchasesStringsByUserIdColonAppId must beEqualTo(UserPurchasesStringsByUserIdColonAppId(userPurchasesByUserIdAndAppId))
          Some(Left(MissingProperty))
        }
        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = None

      }).write(userPurchasesByUserIdAndAppId) must beAnInstanceOf[Failure[_]]
    }

    "read success" in {
      val userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId = UserPurchasesStringsByUserIdColonAppId(userPurchasesByUserIdAndAppId)
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(t: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = ???

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          key.asAVMap must beEqualTo(Map("userIdColonAppId" -> new AttributeValue("testUserId:testAppId")))
          Some(Right(userPurchasesStringsByUserIdColonAppId))
        }
      }).read("testUserId", "testAppId") must beEqualTo(Success(Some(userPurchasesByUserIdAndAppId)))
    }
    "read failure" in {
      new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(t: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = ???

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
          key.asAVMap must beEqualTo(Map("userIdColonAppId" -> new AttributeValue("testUserId:testAppId")))
          Some(Left(MissingProperty))
        }
      }).read("testUserId", "testAppId") must beAnInstanceOf[Failure[_]]
    }
  }
}
