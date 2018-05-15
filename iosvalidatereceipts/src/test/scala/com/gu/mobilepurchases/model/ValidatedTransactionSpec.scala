package com.gu.mobilepurchases.model

import java.time.Instant.ofEpochMilli
import java.time.{ ZoneOffset, ZonedDateTime }

import com.gu.mobilepurchases.model.ValidatedTransactionSpec.sampleValidatedTransaction
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import com.gu.mobilepurchases.userpurchases.UserPurchase.instantFormatter
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.mutable.Specification

object ValidatedTransactionSpec {
  val lastYear: Long = ZonedDateTime.now.minusYears(1).toInstant.toEpochMilli
  val nextYear: Long = ZonedDateTime.now.plusYears(1).toInstant.toEpochMilli
  val sampleValidatedTransaction: ValidatedTransaction = ValidatedTransaction(
    "",
    1,
    1,
    Some(ValidatedTransactionPurchase("", "", ValidatedTransactionPurchaseActiveInterval("", ""))), 0
  )
  val genValidatedTransaction: Gen[ValidatedTransaction] = for {
    transactionId <- genCommonAscii
    validated <- Arbitrary.arbitrary[Long]
    finishTransaction <- Arbitrary.arbitrary[Long]
    purchase <- for {
      webOrderLineItemId <- genCommonAscii
      productId <- genCommonAscii
      activeInterval <- for {
        start <- genCommonAscii
        end <- for {
          epoch <- Gen.choose(lastYear, nextYear)
        } yield ofEpochMilli(epoch).atZone(ZoneOffset.UTC).format(instantFormatter)
      } yield ValidatedTransactionPurchaseActiveInterval(start, end)
    } yield ValidatedTransactionPurchase(productId, webOrderLineItemId, activeInterval)
    appStoreStatusResponse <- Arbitrary.arbitrary[Long]
  } yield ValidatedTransaction(transactionId, validated, finishTransaction, Some(purchase), appStoreStatusResponse)
  val genValidatedTransactions: Gen[Set[ValidatedTransaction]] = Gen.containerOf[Set, ValidatedTransaction](genValidatedTransaction)
}

class ValidatedTransactionSpec extends Specification {
  "ValidatedTransaction" should {
    "1s are true" in {
      sampleValidatedTransaction.copy(validated = 1, finishTransaction = 1) must beEqualTo(ValidatedTransaction(
        sampleValidatedTransaction.transactionId,
        validated = true,
        finishTransaction = true,
        sampleValidatedTransaction.purchase,
        sampleValidatedTransaction.appStoreStatusResponse
      ))
    }
    "0s are false" in {
      sampleValidatedTransaction.copy(validated = 0, finishTransaction = 0) must beEqualTo(ValidatedTransaction(
        sampleValidatedTransaction.transactionId,
        validated = false,
        finishTransaction = false,
        purchase = sampleValidatedTransaction.purchase,
        appStoreStatusResponse = sampleValidatedTransaction.appStoreStatusResponse
      ))
    }
  }
}
