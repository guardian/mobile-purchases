package com.gu.mobilepurchases.userpurchases.persistence


import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.userpurchases.{UserPurchase, UserPurchaseInterval}
import org.specs2.mutable.Specification

class UserPurchasesByUserIdSpec extends Specification {
  "UserPurchasesByUserId" should {
    "marshall and unmarshal from json correctly" in {

      val exampleUserPurchaseByUsedID: UserPurchasesByUserIdAndAppId = UserPurchasesByUserIdAndAppId("userId", "appId", Set(UserPurchase(
        "uk.co.guardian.iphone2",
        "1000000038244261",
        UserPurchaseInterval("2018-03-27T15:20:00.000Z", "2018-03-27T15:25:00.000Z"))))


      val userPurchasesStringsByUserId: UserPurchasesStringsByUserIdColonAppId = UserPurchasesStringsByUserIdColonAppId(
        "userId:appId",
        """[{"productId":"uk.co.guardian.iphone2",
"webOrderLineItemId":"1000000038244261",
"activeInterval":{"start":"2018-03-27T15:20:00.000Z","end":"2018-03-27T15:25:00.000Z"}}]""".stripMargin
      )
      mapper.readTree(
        UserPurchasesStringsByUserIdColonAppId(exampleUserPurchaseByUsedID).purchases
      ) must beEqualTo(mapper.readTree(userPurchasesStringsByUserId.purchases))
      UserPurchasesByUserIdAndAppId(userPurchasesStringsByUserId) must beEqualTo(exampleUserPurchaseByUsedID)
    }
  }
}
