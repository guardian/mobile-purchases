package com.gu.mobilepurchases.userpurchases.persistence

import java.time.{ Clock, Instant, ZoneOffset }

import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import com.gu.scanamo.error.DynamoReadError
import com.gu.scanamo.query.UniqueKey
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

class UserPurchasesByUserIdSpec extends Specification with Mockito {
  val instant = Instant.now()
  "UserPurchasesByUserId" should {
    "marshall and unmarshal from json correctly" in {
      val mockClock = mock[Clock]
      mockClock.instant() returns instant
      mockClock.getZone returns ZoneOffset.UTC
      val userPurchasePersistenceTransformer = new UserPurchasePersistenceTransformer(mockClock)

      val exampleUserPurchaseByUsedID: UserPurchasesByUserIdAndAppId = UserPurchasesByUserIdAndAppId("userId", "appId", Set(UserPurchase(
        "uk.co.guardian.iphone2",
        "1000000038244261",
        UserPurchaseInterval("2018-03-27T15:20:00.000Z", "2018-03-27T15:25:00.000Z"))))

      val userPurchasesStringsByUserId: UserPurchasesStringsByUserIdColonAppId = UserPurchasesStringsByUserIdColonAppId(
        "userId:appId",
        """[{"productId":"uk.co.guardian.iphone2", "webOrderLineItemId":"1000000038244261", "activeInterval":{"start":"2018-03-27T15:20:00.000Z","end":"2018-03-27T15:25:00.000Z"}}]"""
          .stripMargin, 0)

      val userPurchasePersistenceImpl: UserPurchasePersistenceImpl = new UserPurchasePersistenceImpl(new ScanamaoUserPurchasesStringsByUserIdColonAppId {
        override def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = ???

        override def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = ???
      }, userPurchasePersistenceTransformer)

      mapper.readTree(
        userPurchasePersistenceTransformer.transform(exampleUserPurchaseByUsedID).purchases
      ) must beEqualTo(mapper.readTree(userPurchasesStringsByUserId.purchases))
      UserPurchasesByUserIdAndAppId(userPurchasesStringsByUserId) must beEqualTo(exampleUserPurchaseByUsedID)
    }
  }
}
