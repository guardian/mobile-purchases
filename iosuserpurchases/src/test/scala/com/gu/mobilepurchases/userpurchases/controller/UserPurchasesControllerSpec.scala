package com.gu.mobilepurchases.userpurchases.controller

import com.fasterxml.jackson.databind.JsonNode
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.{ commonAsciiChars, genCommonAscii, genStringFromChars }
import com.gu.mobilepurchases.shared.lambda.{ LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.purchases._
import com.gu.mobilepurchases.userpurchases.{ UserPurchase, UserPurchaseInterval }
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.matcher.Matcher
import org.specs2.mutable.Specification

class UserPurchasesControllerSpec extends Specification with ScalaCheck {
  private val okayCode: Int = 200
  private val emptyChars: Seq[Char] = commonAsciiChars.filter((_: Char).isWhitespace)
  private val notEmptyChars: Seq[Char] = commonAsciiChars.filter(!(_: Char).toString.trim.isEmpty)
  private val notEmptyNotCommaChars: Seq[Char] = notEmptyChars.filter(!(_: Char).equals(','))
  private val genNotEmptyAsciiChars: Gen[String] = Gen.zip(genStringFromChars(notEmptyChars), oneOf(notEmptyChars)).map(
    (seqAndItem: (String, Matcher[Seq[Char]])) => seqAndItem._1.concat(seqAndItem._2.toString))
  private val genEmptyString: Gen[String] = genStringFromChars(emptyChars)

  private val genNotCommaOrEmpty: Gen[String] = Gen.zip(genStringFromChars(notEmptyNotCommaChars), Gen.oneOf(notEmptyNotCommaChars)).map(
    (seqAndItem: (String, Char)) => seqAndItem._1.concat(seqAndItem._2.toString))
  private val emptyBodyString: String = """{"purchases":[]}"""
  private val emptyBody: JsonNode = mapper.readTree(emptyBodyString)

  private val genUserIds: Gen[Set[String]] = Gen.zip(genNotCommaOrEmpty, Gen.containerOf[Set, String](genNotCommaOrEmpty)).map(
    (userIdAndSet: (String, Set[String])) => userIdAndSet._2 + userIdAndSet._1)
  "UserPurchasesController" should {
    val knownGoodUserIds: (String, String) = "userIds" -> "gia:319B18F0-3B3A-40FD-9086-6DED1F566D2A,vendorUdid~5E1CFD76-48C7-40F8-8574-D7A7F25D9943"
    val knownAppId: (String, String) = "appId" -> "uk.co.guardian.iphone2"
    val expectedUserPurchaseRequest: UserPurchasesRequest = UserPurchasesRequest(
      "uk.co.guardian.iphone2", Set("gia:319B18F0-3B3A-40FD-9086-6DED1F566D2A", "vendorUdid~5E1CFD76-48C7-40F8-8574-D7A7F25D9943"))
    "missing appId" in {
      new UserPurchasesController((_: UserPurchasesRequest) =>
        throw new IllegalStateException("Should not get this far"))(
        LambdaRequest(Some(""), Map("appId" -> "", knownGoodUserIds))
      ) must beEqualTo(LambdaResponse(okayCode, Some("""{"purchases":[]}"""), Map("Content-Type" -> "application/json; charset=UTF-8")))
    }
    "missing userIds" in {
      new UserPurchasesController((_: UserPurchasesRequest) =>
        throw new IllegalStateException("Should not get this far"))(
        LambdaRequest(Some(""), Map(knownAppId, "userIds" -> ""))
      ) must beEqualTo(LambdaResponse(okayCode, Some("""{"purchases":[]}"""), Map("Content-Type" -> "application/json; charset=UTF-8")))
    }
    "found appId and userId" in {
      val controller: UserPurchasesController = new UserPurchasesController((request: UserPurchasesRequest) => {
        if (request.equals(expectedUserPurchaseRequest)) {
          UserPurchasesResponse(
            Set(
              UserPurchase("knownGoodResponse", "1000000038244261",
                UserPurchaseInterval("2018-03-27T15:20:00.000Z", "2018-03-27T15:25:00.000Z")))
          )
        } else {
          throw new IllegalStateException("")
        }
      }
      )
      val expectedBody: String =
        """{"purchases":[{
             |"productId":"knownGoodResponse",
             |"webOrderLineItemId":"1000000038244261",
             |"activeInterval":{"start":"2018-03-27T15:20:00.000Z","end":"2018-03-27T15:25:00.000Z"}}]}""".stripMargin
      val expectedResponse: LambdaResponse = LambdaResponse(okayCode, Some(
        expectedBody),
        Map("Content-Type" -> "application/json; charset=UTF-8"
        ))
      val response: LambdaResponse = controller(LambdaRequest(None, Map(knownGoodUserIds, knownAppId)))
      response match {
        case LambdaResponse(code, Some(body), headers) => {
          code must beEqualTo(expectedResponse.statusCode)
          headers must beEqualTo(expectedResponse.headers)
          mapper.readTree(body) must beEqualTo(mapper.readTree(expectedBody))
        }
        case _ => response must beEqualTo(expectedResponse)

      }

    }
    "failed on  appId and userId returns empty" in {
      new UserPurchasesController((_: UserPurchasesRequest) => UserPurchasesResponse(Set())
      )(LambdaRequest(None, Map(knownGoodUserIds, knownAppId))) must beEqualTo(
        LambdaResponse(okayCode, Some("""{"purchases":[]}"""), Map("Content-Type" -> "application/json; charset=UTF-8")))
    }
  }
  "ScalaCheck UserPurchasesController" should {
    "Render empty purchases when missing appId" >> {
      implicit val arbitraryUserIds: Arbitrary[Set[String]] = Arbitrary(genUserIds)
      implicit val emptyAppId: Arbitrary[Option[String]] = Arbitrary(Gen.option[String](genEmptyString))
      prop { (maybeAppId: Option[String], userIds: Set[String]) =>
        {
          new UserPurchasesController((userPurchasesRequest: UserPurchasesRequest) => {
            userPurchasesRequest must beNull
            throw new IllegalStateException("Should not get this far")
          })(LambdaRequest(None, Map("userIds" -> userIds.mkString(",")) ++ maybeAppId.map(
            (appId: String) => Map("appId" -> appId)).getOrElse(Map()))) match {
            case LambdaResponse(`okayCode`, Some(body), _) => mapper.readTree(body) must beEqualTo(emptyBody)
            case resp                                      => resp must beEqualTo(LambdaResponse(okayCode, Some(emptyBodyString), Map("Content-Type" -> "application/json; charset=UTF-8")))
          }
        }
      }.setArbitraries(emptyAppId, arbitraryUserIds)
    }

    "Render empty purchases when missing userIds" >> {
      prop { (appId: String, maybeUserIds: Option[Set[String]]) =>
        {
          val userPurchasesControllerImpl: UserPurchasesController = new UserPurchasesController((_: UserPurchasesRequest) =>
            throw new IllegalStateException("Should not get this far"))
          userPurchasesControllerImpl(LambdaRequest(None, Map("appId" -> appId) ++ maybeUserIds.map(
            (userIds: Set[String]) => Map("userIds" -> userIds.mkString(","))).getOrElse(Map()))) match {
            case LambdaResponse(`okayCode`, Some(body), _) => mapper.readTree(body) must beEqualTo(emptyBody)
            case resp                                      => resp must beEqualTo(LambdaResponse(okayCode, Some(emptyBodyString), Map("Content-Type" -> "application/json; charset=UTF-8")))
          }
        }
      }.setArbitraries(Arbitrary(genNotEmptyAsciiChars), Arbitrary(Gen.option(Gen.containerOf[Set, String](genEmptyString))))
    }

    "Render purchases when appId and userIds present" >> {
      implicit val arbitraryUserPurchases: Arbitrary[Set[UserPurchase]] = Arbitrary(Gen.containerOf[Set, UserPurchase] {
        for {
          productId <- genCommonAscii
          webOrderLineItem <- genCommonAscii
          start <- genCommonAscii
          end <- genCommonAscii
        } yield UserPurchase(productId, webOrderLineItem, UserPurchaseInterval(start, end))
      })
      implicit val arbitraryUserIds: Arbitrary[Set[String]] = Arbitrary(genUserIds)
      implicit val arbitraryAppId: Arbitrary[String] = Arbitrary(genNotEmptyAsciiChars)
      prop((userPurchases: Set[UserPurchase], appId: String, userIds: Set[String]) => {
        userIds must not be empty
        forall(userIds)((_: String).trim must not be empty)
        forall(userIds)((_: String).trim must not contain ",")
        appId.trim must not be empty

        val userPurchasesResponse: UserPurchasesResponse = UserPurchasesResponse(userPurchases)
        val userPurchasesControllerImpl: UserPurchasesController = new UserPurchasesController((userPurchasesRequest: UserPurchasesRequest) => {
          userPurchasesRequest must beEqualTo(UserPurchasesRequest(appId, userIds))
          userPurchasesResponse
        })
        userPurchasesControllerImpl(LambdaRequest(None, Map("appId" -> appId, "userIds" -> userIds.mkString(",")))) match {
          case LambdaResponse(`okayCode`, Some(body), _) => mapper.readTree(body) must beEqualTo(
            mapper.readTree(mapper.writeValueAsBytes(userPurchasesResponse)))
          case resp => resp must beEqualTo(
            LambdaResponse(okayCode, Some(mapper.writeValueAsString(userPurchasesResponse)), Map("Content-Type" -> "application/json; charset=UTF-8")))
        }
      }
      ).setArbitraries(arbitraryUserPurchases, arbitraryAppId, arbitraryUserIds)
    }

  }

}
