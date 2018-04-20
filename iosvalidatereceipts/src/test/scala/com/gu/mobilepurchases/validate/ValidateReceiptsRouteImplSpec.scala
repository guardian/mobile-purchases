package com.gu.mobilepurchases.validate

import com.gu.mobilepurchases.apple.{ AppStoreResponse, AppStoreSpec }
import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionSpec }
import com.gu.mobilepurchases.persistence.{ TransactionPersistence, UserIdWithAppId }
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

import scala.util.{ Failure, Success, Try }

object ValidateReceiptsRouteImplSpec {
  val genValidateRequest: Gen[ValidateRequest] = for {
    vendorUdid <- genCommonAscii
    gnmUdid <- genCommonAscii
    deviceInfo <- Gen.mapOf[String, String](Gen.zip(genCommonAscii, genCommonAscii))
    appId <- genCommonAscii
    transactions <- Gen.listOf[ValidateRequestTransaction](for {
      id <- genCommonAscii
      receipt <- genCommonAscii
      typeField <- genCommonAscii
    } yield (ValidateRequestTransaction(id, receipt, typeField)))
    nominatedHandler <- genCommonAscii
  } yield ValidateRequest(ValidateRequestUserIds(gnmUdid, vendorUdid), deviceInfo, ValidateRequestAppInfo(appId), transactions, nominatedHandler)
  val genUserIdWithAppId: Gen[UserIdWithAppId] = for {
    userId <- genCommonAscii
    appId <- genCommonAscii
  } yield UserIdWithAppId(userId, appId)
}

class ValidateReceiptsRouteImplSpec extends Specification with ScalaCheck {
  "ValidateReceiptsRouteImpl" should {
    "follow an expected integration route" >> {
      implicit val arbitraryValidateRequest: Arbitrary[ValidateRequest] = Arbitrary(ValidateReceiptsRouteImplSpec.genValidateRequest)
      implicit val arbitraryTransactionsByResponses: Arbitrary[Map[AppStoreResponse, Set[ValidatedTransaction]]] = Arbitrary(
        Gen.mapOf[AppStoreResponse, Set[ValidatedTransaction]](Gen.zip(
          AppStoreSpec.genLeafAppStoreResponse, ValidatedTransactionSpec.genValidatedTransactions)))
      implicit val arbitraryNotExpiredValidatedTransactions: Arbitrary[Set[ValidatedTransaction]] = Arbitrary(ValidatedTransactionSpec.genValidatedTransactions)
      implicit val arbitraryTryPersist: Arbitrary[Try[_]] = Arbitrary(Gen.oneOf(Success(""), Failure(new IllegalStateException())))
      prop { (
        validateRequest: ValidateRequest,
        transactionsByResponse: Map[AppStoreResponse, Set[ValidatedTransaction]],
        notExpiredTransactions: Set[ValidatedTransaction],
        persistTried: Try[_]
      ) =>
        {

          val validatedTransactions: Set[ValidatedTransaction] = transactionsByResponse.values.flatten.toSet
          val appStoreResponses: Set[AppStoreResponse] = transactionsByResponse.keySet
          new ValidateReceiptsRouteImpl((appStoreResponse: AppStoreResponse) => {
            appStoreResponses must contain(appStoreResponse)
            validatedTransactions
          }, (remainingReceipts: Set[String]) => {
            validateRequest.transactions.map((_: ValidateRequestTransaction).receipt) must containAllOf(remainingReceipts.toSeq)
            appStoreResponses
          }, (unfilteredTransactions: Set[ValidatedTransaction]) => {
            unfilteredTransactions must beEqualTo(validatedTransactions)
            notExpiredTransactions
          }, new TransactionPersistence {
            override def persist(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction]): Try[_] = {
              userIdWithAppId must beEqualTo(UserIdWithAppId(validateRequest.userIds.vendorUdid, validateRequest.appInfo.id))
              transactions must beEqualTo(notExpiredTransactions)
              persistTried
            }

            override def transformValidateRequest(validateReceiptRequest: ValidateRequest): UserIdWithAppId = {
              validateReceiptRequest must beEqualTo(validateRequest)
              UserIdWithAppId(validateRequest.userIds.vendorUdid, validateReceiptRequest.appInfo.id)
            }

          }).route(validateRequest) must beEqualTo(persistTried match {
            case Success(_) => Success(notExpiredTransactions)
            case failure    => failure
          })
        }
      }.setArbitraries(
        arbitraryValidateRequest,
        arbitraryTransactionsByResponses,
        arbitraryNotExpiredValidatedTransactions,
        arbitraryTryPersist)
    }

  }
}
