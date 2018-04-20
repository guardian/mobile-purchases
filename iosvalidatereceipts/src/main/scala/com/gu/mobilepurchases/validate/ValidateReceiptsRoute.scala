package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.AppStoreResponse
import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.persistence.{ TransactionPersistence, UserIdWithAppId }

import scala.util.Try

trait ValidateReceiptsRoute {
  def route(validateReceiptRequest: ValidateRequest): Try[Set[ValidatedTransaction]]
}

class ValidateReceiptsRouteImpl(
    validateReceiptsTransformAppStoreResponse: ValidateReceiptsTransformAppStoreResponse,
    validateReceipts: FetchAppStoreResponses,
    validateReceiptsFilterExpired: ValidateReceiptsFilterExpired,
    transactionPersistence: TransactionPersistence) extends ValidateReceiptsRoute {
  def route(validateReceiptRequest: ValidateRequest): Try[Set[ValidatedTransaction]] = {
    val allAppStoreResponses: Set[AppStoreResponse] = validateReceipts.fetchAllValidatedTransactions(validateReceiptRequest.receipts)
    val allTransactions: Set[ValidatedTransaction] = allAppStoreResponses.flatMap(validateReceiptsTransformAppStoreResponse.transformAppStoreResponse)
    val filteredTransactions: Set[ValidatedTransaction] = validateReceiptsFilterExpired.filterExpired(allTransactions)
    val triedToPersist: Try[_] = persist(validateReceiptRequest, filteredTransactions)
    triedToPersist.map((_: Any) => filteredTransactions)
  }

  private def persist(validateReceiptRequest: ValidateRequest, filteredTransactions: Set[ValidatedTransaction]): Try[_] = {
    val userIdWithAppId: UserIdWithAppId = transactionPersistence.transformValidateRequest(validateReceiptRequest)
    transactionPersistence.persist(userIdWithAppId, filteredTransactions)
  }
}
