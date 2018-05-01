package com.gu.mobilepurchases.userpurchases.purchases

import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesSpec.genMatchingAppIdWithUserPurchasesByUserId
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import org.apache.logging.log4j.Logger
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.util.{ Failure, Success, Try }

case class AppIdWithUserPurchasesByUserId(appId: String, userPurchases: Map[String, Set[UserPurchase]])

object UserPurchasesSpec {
  def emptyOrApply(random: String, stringFunc: (String => String)): String = if (random.isEmpty) {
    random
  } else {
    stringFunc(random)

  }

  def genMatchingAppIdWithUserPurchasesByUserId: Gen[AppIdWithUserPurchasesByUserId] = for {
    randomString <- genCommonAscii
    orderIdsStartsAndEnds <- Gen.mapOf[String, Set[(String, String, String)]](
      Gen.zip[String, Set[(String, String, String)]](
        genCommonAscii.map("vendorUdid~".concat(_: String)),
        Gen.containerOf[Set, (String, String, String)](for {
          randomPurchaseString <- genCommonAscii
        } yield (
          emptyOrApply(randomPurchaseString, (_: String).concat("webOrderLineItemId")),
          emptyOrApply(randomPurchaseString, (_: String).concat("start")),
          emptyOrApply(randomPurchaseString, (_: String).concat("end"))))))
  } yield AppIdWithUserPurchasesByUserId(randomString, orderIdsStartsAndEnds.mapValues(
    (_: Set[(String, String, String)]).map((v: (String, String, String)) =>
      UserPurchase(randomString, v._1, UserPurchaseInterval(v._2, v._3)))))
}

class UserPurchasesSpec extends Specification with ScalaCheck with Mockito {
  "UserPurchases" should {
    "find matching purchases" >> {
      implicit val arbitraryPurchasesByUserId: Arbitrary[AppIdWithUserPurchasesByUserId] = Arbitrary(genMatchingAppIdWithUserPurchasesByUserId)
      prop { (appIdWithUserPurchasesByUserId: AppIdWithUserPurchasesByUserId) =>
        {
          val userPurchasesByUserId: Map[String, Set[UserPurchase]] = appIdWithUserPurchasesByUserId.userPurchases
          val userIds: Set[String] = userPurchasesByUserId.keySet

          new UserPurchasesImpl(new UserPurchasePersistence {
            override def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]] =
              throw new UnsupportedOperationException

            override def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]] = {
              userIds must contain(userId)
              appId must beEqualTo(appIdWithUserPurchasesByUserId.appId)
              Success(userPurchasesByUserId.get(userId).map((purchases: Set[UserPurchase]) => UserPurchasesByUserIdAndAppId(userId, appId, purchases)))
            }
          }).findPurchases(UserPurchasesRequest(appIdWithUserPurchasesByUserId.appId, userIds)) must beEqualTo(
            UserPurchasesResponse(userPurchasesByUserId.values.flatten.toSet))
        }
      }.setArbitrary(arbitraryPurchasesByUserId)
    }

    "no purchases" >> {
      implicit val arbitraryAppIdWithUserPurchasesByUserId: Arbitrary[AppIdWithUserPurchasesByUserId] = Arbitrary(
        genMatchingAppIdWithUserPurchasesByUserId)
      prop { (appIdWithUserPurchasesByUserId: AppIdWithUserPurchasesByUserId) =>
        {
          val userPurchasesByUserId: Map[String, Set[UserPurchase]] = appIdWithUserPurchasesByUserId.userPurchases
          val userIds: Set[String] = userPurchasesByUserId.keySet
          new UserPurchasesImpl(new UserPurchasePersistence {
            override def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]] =
              throw new UnsupportedOperationException

            override def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]] = {
              userIds must contain(userId)
              appId must beEqualTo(appIdWithUserPurchasesByUserId.appId)
              Success(None)
            }
          }).findPurchases(UserPurchasesRequest(appIdWithUserPurchasesByUserId.appId, userIds)) must beEqualTo(UserPurchasesResponse(Set()))
        }
      }.setArbitrary(arbitraryAppIdWithUserPurchasesByUserId)

    }

    "fail purchases" in {
      implicit val arbitraryAppIdWithUserPurchasesByUserId: Arbitrary[AppIdWithUserPurchasesByUserId] = Arbitrary(
        genMatchingAppIdWithUserPurchasesByUserId)
      prop { (appIdWithUserPurchasesByUserId: AppIdWithUserPurchasesByUserId) =>
        {
          val mockLogger = mock[Logger]
          val userPurchasesByUserId: Map[String, Set[UserPurchase]] = appIdWithUserPurchasesByUserId.userPurchases
          val userIds: Set[String] = userPurchasesByUserId.keySet
          new UserPurchasesImpl(new UserPurchasePersistence {
            override def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]] =
              throw new UnsupportedOperationException

            override def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]] = {
              userIds must contain(userId)
              appId must beEqualTo(appIdWithUserPurchasesByUserId.appId)
              Failure(new IllegalStateException("Ignored"))
            }
          }, mockLogger).findPurchases(UserPurchasesRequest(appIdWithUserPurchasesByUserId.appId, userIds)) must beEqualTo(UserPurchasesResponse(Set()))
          there was exactly(appIdWithUserPurchasesByUserId.userPurchases.size)(mockLogger).warn(anyString, any[Throwable]())
        }
      }.setArbitrary(arbitraryAppIdWithUserPurchasesByUserId)
    }
  }
}
