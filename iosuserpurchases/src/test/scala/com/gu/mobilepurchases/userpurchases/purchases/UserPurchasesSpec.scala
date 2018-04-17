package com.gu.mobilepurchases.userpurchases.purchases

import java.time.Instant
import java.time.Instant.ofEpochMilli
import java.time.ZoneOffset.UTC
import java.time.temporal.ChronoUnit.{ HOURS, MONTHS }

import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import com.gu.mobilepurchases.userpurchases.UserPurchase.instantFormatter
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import com.gu.mobilepurchases.userpurchases.purchases.UserPurchasesSpec.{ genFutureDate, genMatchingAppIdWithUserPurchasesByUserId, genPastDate }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

import scala.util.{ Failure, Success, Try }

case class AppIdWithUserPurchasesByUserId(appId: String, userPurchases: Map[String, Set[UserPurchase]])

object UserPurchasesSpec {
  private val instantNow: Instant = Instant.now()
  val genFutureDate: Gen[String] = for {
    epoch <- Gen.choose[Long](instantNow.plus(1, HOURS).toEpochMilli, instantNow.atZone(UTC).plus(1, MONTHS).toInstant.toEpochMilli)
  } yield ofEpochMilli(epoch).atZone(UTC).format(instantFormatter)
  val genPastDate: Gen[String] = for {
    epoch <- Gen.choose[Long](instantNow.atZone(UTC).minus(1, MONTHS).toInstant.toEpochMilli, instantNow.minus(1, HOURS).toEpochMilli)
  } yield ofEpochMilli(epoch).atZone(UTC).format(instantFormatter)

  def genMatchingAppIdWithUserPurchasesByUserId(endDateGen: Gen[String]): Gen[AppIdWithUserPurchasesByUserId] = for {
    productId <- genCommonAscii
    orderIdsStartsAndEnds <- Gen.mapOf[String, Set[(String, String, String)]](
      Gen.zip[String, Set[(String, String, String)]](
        genCommonAscii,
        Gen.containerOf[Set, (String, String, String)](for {
          webOrderLineItemId <- genCommonAscii
          start <- genCommonAscii
          end <- endDateGen
        } yield (webOrderLineItemId, start, end))))
  } yield AppIdWithUserPurchasesByUserId(productId, orderIdsStartsAndEnds.mapValues(
    (_: Set[(String, String, String)]).map((v: (String, String, String)) =>
      UserPurchase(productId, v._1, UserPurchaseInterval(v._2, v._3)))))

  def genConflictingAppIdWithUserPurchasesByUserId(endDateGen: Gen[String]): Gen[AppIdWithUserPurchasesByUserId] = for {
    productIdAndAppId <- Gen.zip(genCommonAscii, genCommonAscii).suchThat { case (a, b) => !a.equals(b) }
    orderIdsStartsAndEnds <- Gen.mapOf[String, Set[(String, String, String)]](
      Gen.zip[String, Set[(String, String, String)]](
        genCommonAscii,
        Gen.containerOf[Set, (String, String, String)](for {
          webOrderLineItemId <- genCommonAscii
          start <- genCommonAscii
          end <- endDateGen
        } yield (webOrderLineItemId, start, end))))
  } yield AppIdWithUserPurchasesByUserId(productIdAndAppId._1, orderIdsStartsAndEnds.mapValues(
    (_: Set[(String, String, String)]).map((v: (String, String, String)) =>
      UserPurchase(productIdAndAppId._2, v._1, UserPurchaseInterval(v._2, v._3)))))
}

class UserPurchasesSpec extends Specification with ScalaCheck {
  "UserPurchases" should {
    "find matching purchases" >> {
      implicit val arbitraryPurchasesByUserId: Arbitrary[AppIdWithUserPurchasesByUserId] = Arbitrary(genMatchingAppIdWithUserPurchasesByUserId(genFutureDate))
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

    "miss out of date matching purchases" >> {
      implicit val arbitraryPurchasesByUserId: Arbitrary[AppIdWithUserPurchasesByUserId] = Arbitrary(genMatchingAppIdWithUserPurchasesByUserId(genPastDate))
      prop { (appIdWithUserPurchasesByUserId: AppIdWithUserPurchasesByUserId) =>
        {
          val userPurchasesByUserId: Map[String, Set[UserPurchase]] = appIdWithUserPurchasesByUserId.userPurchases
          val userIds: Set[String] = userPurchasesByUserId.keySet

          new UserPurchasesImpl(new UserPurchasePersistence {
            override def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]] =
              throw new UnsupportedOperationException

            override def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]] = {
              appId must beEqualTo(appIdWithUserPurchasesByUserId.appId)
              userIds must contain(userId)
              Success(userPurchasesByUserId.get(userId).map((purchases: Set[UserPurchase]) => UserPurchasesByUserIdAndAppId(userId, appId, purchases)))
            }
          }).findPurchases(UserPurchasesRequest(appIdWithUserPurchasesByUserId.appId, userIds)) must beEqualTo(UserPurchasesResponse(Set()))
        }
      }.setArbitrary(arbitraryPurchasesByUserId)
    }

    "no purchases" >> {
      implicit val arbitraryAppIdWithUserPurchasesByUserId: Arbitrary[AppIdWithUserPurchasesByUserId] = Arbitrary(
        genMatchingAppIdWithUserPurchasesByUserId(genFutureDate))
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
        genMatchingAppIdWithUserPurchasesByUserId(genFutureDate))
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
              Failure(new IllegalStateException("Ignored"))
            }
          }).findPurchases(UserPurchasesRequest(appIdWithUserPurchasesByUserId.appId, userIds)) must beEqualTo(UserPurchasesResponse(Set()))
        }
      }.setArbitrary(arbitraryAppIdWithUserPurchasesByUserId)

    }
  }
}
