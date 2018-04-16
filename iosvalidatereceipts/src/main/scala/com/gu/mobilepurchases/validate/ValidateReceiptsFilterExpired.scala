package com.gu.mobilepurchases.validate

import java.time.{Clock, ZonedDateTime}

import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.validate.ValidateReceiptsFilterExpiredImpl.logger
import org.apache.logging.log4j.{LogManager, Logger}

object ValidateReceiptsFilterExpiredImpl {
  val logger: Logger = LogManager.getLogger(classOf[ValidateReceiptsFilterExpiredImpl])
}

trait ValidateReceiptsFilterExpired {
  def filterExpired(unfilteredTransactions: Set[ValidatedTransaction]): Set[ValidatedTransaction]
}

class ValidateReceiptsFilterExpiredImpl(clock: Clock = Clock.systemUTC()) extends ValidateReceiptsFilterExpired {
  def filterExpired(unfilteredTransactions: Set[ValidatedTransaction]): Set[ValidatedTransaction] = {
    val now: ZonedDateTime = ZonedDateTime.now(clock)
    logger.info("Unfiltered transactions {}", unfilteredTransactions)
    val transactions: Set[ValidatedTransaction] = unfilteredTransactions.filter((transaction: ValidatedTransaction) => {
      ZonedDateTime.parse(transaction.purchase.activeInterval.end).isAfter(now)
    })
    transactions
  }

}