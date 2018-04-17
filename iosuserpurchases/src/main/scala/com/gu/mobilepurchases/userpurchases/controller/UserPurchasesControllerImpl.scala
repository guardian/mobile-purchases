package com.gu.mobilepurchases.userpurchases.controller

import com.gu.mobilepurchases.shared.external.HttpStatusCodes.okCode
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{LambdaRequest, LambdaResponse}
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesControllerImpl.emptyPurchasesResponse
import com.gu.mobilepurchases.userpurchases.purchases.{UserPurchases, UserPurchasesRequest, UserPurchasesResponse}
import org.apache.http.HttpHeaders
import org.apache.http.entity.ContentType
import org.apache.logging.log4j.{LogManager, Logger}


object UserPurchasesControllerImpl {
  val defaultHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.APPLICATION_JSON.getMimeType)
  val emptyPurchasesResponse: LambdaResponse = LambdaResponse(okCode, Some(mapper.writeValueAsString(UserPurchasesResponse(Set()))), defaultHeaders)
  val logger: Logger = LogManager.getLogger(classOf[UserPurchasesControllerImpl])
}

class UserPurchasesControllerImpl(userPurchases: UserPurchases) extends Function[LambdaRequest, LambdaResponse] {
  override def apply(lambdaRequest: LambdaRequest): LambdaResponse = {
    val parameters: Map[String, String] = lambdaRequest.queryStringParameters
    (for {
      appId <- parameters.get("appId")
        .map((_: String).trim)
        .flatMap((maybeAppId: String) => if (maybeAppId.isEmpty) None else Some(maybeAppId))
      userIDs: Set[String] <- parameters.get("userIds")
        .map((_: String).split(",")
          .map((_: String).trim)
          .filter((_: String).nonEmpty).toSet).flatMap((set: Set[String]) => if (set.isEmpty) None else Some(set))
    } yield UserPurchasesRequest(appId, userIDs)).map(userPurchases.findPurchases).map((purchases: UserPurchasesResponse) =>
      LambdaResponse(
        okCode,
        Some(mapper.writeValueAsString(purchases)),
        UserPurchasesControllerImpl.defaultHeaders
      ))
      .getOrElse(emptyPurchasesResponse)
  }
}
