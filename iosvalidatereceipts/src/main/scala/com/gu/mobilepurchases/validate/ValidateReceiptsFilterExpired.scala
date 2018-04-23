package com.gu.mobilepurchases.validate

import java.time.{ Clock, ZonedDateTime }

import com.gu.mobilepurchases.model.ValidatedTransaction
import org.apache.logging.log4j.{ LogManager, Logger }

trait ValidateReceiptsFilterExpired {
  def filterExpired(unfilteredTransactions: Set[ValidatedTransaction]): Set[ValidatedTransaction]
}

class ValidateReceiptsFilterExpiredImpl(clock: Clock = Clock.systemUTC()) extends ValidateReceiptsFilterExpired {
  def filterExpired(unfilteredTransactions: Set[ValidatedTransaction]): Set[ValidatedTransaction] = {
    val now: ZonedDateTime = ZonedDateTime.now(clock)
    val transactions: Set[ValidatedTransaction] = unfilteredTransactions.filter((transaction: ValidatedTransaction) => {
      ZonedDateTime.parse(transaction.purchase.activeInterval.end).isAfter(now)
    })
    transactions
  }

}