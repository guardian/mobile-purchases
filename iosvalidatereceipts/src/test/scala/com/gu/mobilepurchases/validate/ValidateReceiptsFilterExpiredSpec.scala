package com.gu.mobilepurchases.validate

import java.time.Clock.systemUTC
import java.time.ZoneOffset.UTC
import java.time.{ Clock, Duration, ZonedDateTime }

import com.gu.mobilepurchases.model.ValidatedTransactionSpec.sampleValidatedTransaction
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionSpec }
import com.gu.mobilepurchases.validate.ValidateReceiptsFilterExpiredSpec.{ expectedDate, sampleTransactionAtExpectedData }
import org.scalacheck.Arbitrary
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

object ValidateReceiptsFilterExpiredSpec {
  val expectedDate: String = "2018-03-26T12:24:23.107Z"
  val sampleTransactionAtExpectedData: ValidatedTransaction = sampleValidatedTransaction.copy(purchase =
    sampleValidatedTransaction.purchase.copy(activeInterval =
      sampleValidatedTransaction.purchase.activeInterval.copy(end = expectedDate)
    ))
}

class ValidateReceiptsFilterExpiredSpec extends Specification with ScalaCheck {

  "ValidateReceiptsFilterExpired" should {
    "filter nothing" in {
      new ValidateReceiptsFilterExpiredImpl().filterExpired(Set()) must beEqualTo(Set())
    }

    "filter single expired" in {
      new ValidateReceiptsFilterExpiredImpl(Clock.offset(systemUTC(), Duration.between(
        ZonedDateTime.now(UTC), ZonedDateTime.parse(expectedDate).plusHours(2)))).filterExpired(Set(sampleTransactionAtExpectedData)) must beEqualTo(Set())
    }

    "filter none expired" in {
      new ValidateReceiptsFilterExpiredImpl(Clock.offset(systemUTC(), Duration.between(
        ZonedDateTime.now(UTC), ZonedDateTime.parse(expectedDate).minusHours(2)))).filterExpired(Set(sampleTransactionAtExpectedData)) must beEqualTo(Set(sampleTransactionAtExpectedData))
    }

    "ScalaCheck" >> {
      val time: ZonedDateTime = ZonedDateTime.now()
      implicit val arbitraryValidatedTransactionSet: Arbitrary[Set[ValidatedTransaction]] = Arbitrary(ValidatedTransactionSpec.genValidatedTransactions)
      prop { (validatedTransactions: Set[ValidatedTransaction]) =>
        {
          new ValidateReceiptsFilterExpiredImpl().filterExpired(validatedTransactions) must beEqualTo(
            validatedTransactions.filter((transaction: ValidatedTransaction) => {
              ZonedDateTime.parse(transaction.purchase.activeInterval.end).isAfter(time)
            })
          )
        }
      }.setArbitrary(arbitraryValidatedTransactionSet)
    }
  }
}
