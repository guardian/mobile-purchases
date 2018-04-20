package com.gu.mobilepurchases.persistence

import com.gu.mobilepurchases.model.{ ValidatedTransaction, ValidatedTransactionPurchase, ValidatedTransactionSpec }
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import com.gu.mobilepurchases.userpurchases.persistence.{ UserPurchasePersistence, UserPurchasesByUserIdAndAppId }
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.mobilepurchases.validate._
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

import scala.util.{ Success, Try }

case class ValidateRequestWithTransactions(userIdWithAppId: UserIdWithAppId, transactions: Set[ValidatedTransaction])

object TransactionPersistenceImplSpec {

  val genValidateRequestWithTransactions: Gen[ValidateRequestWithTransactions] = for {
    userId <- genCommonAscii
    appId <- genCommonAscii
    transactions <- ValidatedTransactionSpec.genValidatedTransactions
  } yield ValidateRequestWithTransactions(
    UserIdWithAppId(userId, appId),
    transactions)

}

class TransactionPersistenceImplSpec extends Specification with ScalaCheck {
  "TransactionPersistenceImplSpec" should {
    "Should create user purchases from validateRequest and validate request transaction" >> {
      implicit val arbitraryValidateRequestWithTransactions: Arbitrary[ValidateRequestWithTransactions] = Arbitrary(
        TransactionPersistenceImplSpec.genValidateRequestWithTransactions)
      prop { (validateRequestWithTransactions: ValidateRequestWithTransactions) =>
        {
          new TransactionPersistenceImpl(new UserPurchasePersistence {
            override def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]] = {
              val userIdWithAppId: UserIdWithAppId = validateRequestWithTransactions.userIdWithAppId
              userPurchasesByUserId must beEqualTo(UserPurchasesByUserIdAndAppId(userIdWithAppId.userId, userIdWithAppId.appId,
                validateRequestWithTransactions.transactions.map((transaction: ValidatedTransaction) => {
                  val purchase: ValidatedTransactionPurchase = transaction.purchase
                  UserPurchase(

                    purchase.productId,
                    purchase.webOrderLineItemId,
                    UserPurchaseInterval(purchase.activeInterval.start, purchase.activeInterval.end))
                })
              ))
              Success(None)
            }

            override def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]] = throw new UnsupportedOperationException
          }).persist(validateRequestWithTransactions.userIdWithAppId, validateRequestWithTransactions.transactions) must haveClass[Success[_]]
        }
      }.setArbitrary(arbitraryValidateRequestWithTransactions)
    }

  }
}
