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
    transactionPersistence: TransactionPersistence) extends ValidateReceiptsRoute {
  def route(validateReceiptRequest: ValidateRequest): Try[Set[ValidatedTransaction]] = {
    val allAppStoreResponses: Set[AppStoreResponse] = validateReceipts.fetchAllValidatedTransactions(validateReceiptRequest.receipts)
    val allTransactions: Set[ValidatedTransaction] = allAppStoreResponses.flatMap(validateReceiptsTransformAppStoreResponse.transformAppStoreResponse)
    val triedToPersist: Try[_] = persist(validateReceiptRequest, allTransactions)
    triedToPersist.map((_: Any) => allTransactions)
  }

  private def persist(validateReceiptRequest: ValidateRequest, allTransactions: Set[ValidatedTransaction]): Try[_] = {
    val userIdWithAppId: UserIdWithAppId = transactionPersistence.transformValidateRequest(validateReceiptRequest)
    transactionPersistence.persist(userIdWithAppId, allTransactions)
  }
}
