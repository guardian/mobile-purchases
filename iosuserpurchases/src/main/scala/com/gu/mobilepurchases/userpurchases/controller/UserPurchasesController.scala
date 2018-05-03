package com.gu.mobilepurchases.userpurchases.controller

import java.nio.charset.StandardCharsets

import com.gu.mobilepurchases.shared.external.HttpStatusCodes
import com.gu.mobilepurchases.shared.external.HttpStatusCodes.okCode
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.shared.lambda.{ LambdaRequest, LambdaResponse }
import com.gu.mobilepurchases.userpurchases.controller.UserPurchasesController.emptyPurchasesResponse
import com.gu.mobilepurchases.userpurchases.purchases.{ UserPurchases, UserPurchasesRequest, UserPurchasesResponse }
import org.apache.http.HttpHeaders
import org.apache.http.entity.ContentType
import org.apache.logging.log4j.LogManager

import scala.util.{ Failure, Success, Try }

object UserPurchasesController {
  val errorHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.TEXT_PLAIN.withCharset(StandardCharsets.UTF_8).toString)
  val defaultHeaders: Map[String, String] = Map(HttpHeaders.CONTENT_TYPE -> ContentType.APPLICATION_JSON.toString)
  val emptyPurchasesResponse: LambdaResponse = LambdaResponse(okCode, Some(mapper.writeValueAsString(UserPurchasesResponse(Set()))), defaultHeaders)
  private val serverError: LambdaResponse = LambdaResponse(HttpStatusCodes.internalServerError, Some("Failed to process request"), errorHeaders)
}

class UserPurchasesController(userPurchases: UserPurchases) extends Function[LambdaRequest, LambdaResponse] {
  val logger = LogManager.getLogger(classOf[UserPurchasesController])
  override def apply(lambdaRequest: LambdaRequest): LambdaResponse = {
    val parameters: Map[String, String] = lambdaRequest.queryStringParameters
    Try {
      (for {
        appId <- parameters.get("appId").map((_: String).trim).filter((_: String).nonEmpty)
        userIDs: Set[String] <- parameters.get("userIds").flatMap(extractMaybeUserIds)
      } yield UserPurchasesRequest(appId, userIDs)).map(userPurchases.findPurchases).map((purchases: UserPurchasesResponse) =>
        LambdaResponse(
          okCode,
          Some(mapper.writeValueAsString(purchases)),
          UserPurchasesController.defaultHeaders
        ))
        .getOrElse(emptyPurchasesResponse)
    } match {
      case Success(response) => response
      case Failure(throwable) => {
        logger.warn("Error executing lambda", throwable)
        UserPurchasesController.serverError
      }
    }

  }

  def extractMaybeUserIds(userIds: String): Option[Set[String]] = {
    val maybeEmptyUserIds: Set[String] = userIds.split(",")
      .toSeq
      .map((_: String).trim)
      .filter((_: String).nonEmpty)
      .toSet
    if (maybeEmptyUserIds.isEmpty) None else Some(maybeEmptyUserIds)
  }
}
