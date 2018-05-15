package com.gu.mobilepurchases.persistence

import java.time.Clock.systemUTC
import java.time.Instant.ofEpochMilli
import java.time.ZoneOffset.UTC
import java.time.{ Clock, Duration, ZonedDateTime }

import com.gu.mobilepurchases.persistence.UserPurchaseFilterExpiredSpec.{ clockBeforeExpiredDate, expectedDate, genUserPurchase, sampleUserPurchase }
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils
import com.gu.mobilepurchases.userpurchases.UserPurchase.instantFormatter
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

object UserPurchaseFilterExpiredSpec {
  val expectedDate: String = "2018-03-26T12:24:23.107Z"
  val clockBeforeExpiredDate: Clock = Clock.offset(systemUTC(), Duration.between(
    ZonedDateTime.now(UTC), ZonedDateTime.parse(expectedDate).minusHours(2)))

  val sampleUserPurchase: UserPurchase = UserPurchase("productId", "webOrderItemId", UserPurchaseInterval("ignored", expectedDate))
  val genUserPurchase: Gen[UserPurchase] = for {
    productId <- ScalaCheckUtils.genCommonAscii
    webOrderLineItemId <- ScalaCheckUtils.genCommonAscii
    start <- ScalaCheckUtils.genReasonableEpoch
    end <- ScalaCheckUtils.genReasonableEpoch

  } yield UserPurchase(
    productId,
    webOrderLineItemId,
    UserPurchaseInterval(
      ofEpochMilli(start).atZone(UTC).format(instantFormatter),
      ofEpochMilli(end).atZone(UTC).format(instantFormatter))
  )
}

class UserPurchaseFilterExpiredSpec extends Specification with ScalaCheck {

  "ValidateReceiptsFilterExpired" should {
    val clock: Clock = Clock.systemUTC()
    "filter nothing" in {
      new UserPurchaseFilterExpiredImpl(clock).filterExpired(Set()) must beEqualTo(Set())
    }

    "filter single expired" in {
      new UserPurchaseFilterExpiredImpl(Clock.offset(systemUTC(), Duration.between(
        ZonedDateTime.now(UTC), ZonedDateTime.parse(expectedDate).plusMonths(2)))).filterExpired(Set(sampleUserPurchase)) must beEqualTo(Set())
    }

    "filter none expired" in {

      new UserPurchaseFilterExpiredImpl(clockBeforeExpiredDate).filterExpired(Set(sampleUserPurchase)) must beEqualTo(Set(sampleUserPurchase))
    }

    "ScalaCheck" >> {
      val time: ZonedDateTime = ZonedDateTime.now()
      implicit val arbitraryValidatedTransactionSet: Arbitrary[Set[UserPurchase]] = Arbitrary(Gen.containerOf[Set, UserPurchase](genUserPurchase)
      )

      prop { (validatedTransactions: Set[UserPurchase]) =>
        {

          new UserPurchaseFilterExpiredImpl(clock).filterExpired(validatedTransactions) must beEqualTo(
            validatedTransactions.filter((purchase: UserPurchase) => {
              ZonedDateTime.parse(purchase.activeInterval.end).isAfter(time)
            })
          )
        }
      }.setArbitrary(arbitraryValidatedTransactionSet)
    }
  }
}
