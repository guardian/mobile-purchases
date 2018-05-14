package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.AppStoreResponse
import com.gu.mobilepurchases.model.ValidatedTransaction
import com.gu.mobilepurchases.persistence.{ TransactionPersistence, UserIdWithAppId }
import org.apache.logging.log4j.LogManager

import scala.util.Try

trait ValidateReceiptsRoute {
  def route(validateReceiptRequest: ValidateRequest): Try[ValidateResponse]
}

class ValidateReceiptsRouteImpl(
    validateReceiptsTransformAppStoreResponse: ValidateReceiptsTransformAppStoreResponse,
    validateReceipts: FetchAppStoreResponses,
    transactionPersistence: TransactionPersistence) extends ValidateReceiptsRoute {
  val logger = LogManager.getLogger(classOf[ValidateReceiptsRouteImpl])

  def route(validateReceiptRequest: ValidateRequest): Try[ValidateResponse] = {
    val allAppStoreResponses: Set[AppStoreResponse] = validateReceipts.fetchAllValidatedTransactions(validateReceiptRequest.receipts).values.toSet
    val allTransactions: Set[ValidatedTransaction] = allAppStoreResponses.flatMap(validateReceiptsTransformAppStoreResponse.transformAppStoreResponse)
    val triedToPersist: Try[_] = persist(validateReceiptRequest, allTransactions)
    val requestedTransactions: Set[ValidatedTransaction] = iosExpectsValidatedTransactionsForReceiptsSent(validateReceiptRequest, allTransactions)
    val response: ValidateResponse = ValidateResponse(requestedTransactions)

    triedToPersist.map((_: Any) => {
      response
    })
  }

  private def iosExpectsValidatedTransactionsForReceiptsSent(
    validateReceiptRequest: ValidateRequest,
    allTransactions: Set[ValidatedTransaction]
  ): Set[ValidatedTransaction] = {
    val validatedTransactions: Set[String] = validateReceiptRequest.transactions.map(_.id).toSet
    val stringToTransactions: Map[String, Set[ValidatedTransaction]] = allTransactions.groupBy(_.transactionId)
    stringToTransactions
      .filterKeys(validatedTransactions.contains)
      .values
      .map((_: Set[ValidatedTransaction])
        .maxBy((_: ValidatedTransaction).purchase.map(_.activeInterval.end).getOrElse("")))
      .toSet
  }

  private def persist(validateReceiptRequest: ValidateRequest, allTransactions: Set[ValidatedTransaction]): Try[_] = {
    val userIdWithAppId: UserIdWithAppId = transactionPersistence.transformValidateRequest(validateReceiptRequest)
    transactionPersistence.persist(userIdWithAppId, allTransactions)
  }
}
