package com.gu.mobilepurchases.validate

import com.fasterxml.jackson.annotation.JsonProperty
import com.gu.mobilepurchases.external.Base64Utils.encoder
import com.gu.mobilepurchases.external.Jackson.mapper
import com.gu.mobilepurchases.lambda._
import com.gu.mobilepurchases.validate.ValidateReceiptsControllerImpl.{badRequest, okCode}
import org.apache.logging.log4j.{LogManager, Logger}

import scala.util.{Failure, Success, Try}

case class ValidateRequestTransaction(id: String,
                                      receipt: String,
                                      @JsonProperty("type") typeField: String)

case class ValidateRequestAppInfo(id: String)

case class ValidateRequestUserIds(gnmUdid: String, vendorUdid: String)

case class ValidateRequest(userIds: ValidateRequestUserIds,
                           deviceInfo: Map[String, String],
                           appInfo: ValidateRequestAppInfo,
                           transactions: List[ValidateRequestTransaction],
                           nominatedHandler: String)

case class ValidatedTransactionPurchaseActiveInterval(start: String, end: String)

case class ValidatedTransactionPurchase(
                                         productId: String,
                                         webOrderLineItemId: String,
                                         activeInterval: ValidatedTransactionPurchaseActiveInterval
                                       )

object ValidatedTransaction {
  def apply(transactionId: String,
            validated: Boolean,
            finishTransaction: Boolean,
            purchase: ValidatedTransactionPurchase,
            appStoreStatusResponse: Long
           ): ValidatedTransaction = {
    val validatedLong = if (validated) 1 else 0
    val finishTransactionLong = if (finishTransaction) 1 else 0
    ValidatedTransaction(transactionId, validatedLong, finishTransactionLong, purchase, appStoreStatusResponse)

  }
}

case class ValidatedTransaction(
                                 transactionId: String,
                                 validated: Long,
                                 finishTransaction: Long,
                                 purchase: ValidatedTransactionPurchase,
                                 appStoreStatusResponse: Long
                               ) {

}

case class ValidateResponse(transactions: List[ValidatedTransaction])

case class BadValidateReceiptResponse()

trait ValidateReceiptsController {
  def validate(lambdaRequest: LambdaRequest): LambdaResponse
}

object ValidateReceiptsControllerImpl {
  val okCode: Int = 200
  val badRequest: Int = 400
  val logger: Logger = LogManager.getLogger(classOf[ValidateReceiptsControllerImpl])
}

class ValidateReceiptsControllerImpl(
                                      validateReceiptsValidator: ValidateReceiptsValidator
                                    ) extends ValidateReceiptsController {
  def validate(lambdaRequest: LambdaRequest): LambdaResponse =
    lambdaRequest match {
      case LambdaRequest(Some(Left(json))) => validate(Try(mapper.readValue(json, classOf[ValidateRequest])) recoverWith {
        case t => ValidateReceiptsControllerImpl.logger.warn(s"Error reading json: $json", t)
          Failure(t)
      })

      case LambdaRequest(Some(Right(bytes))) => validate(Try(mapper.readValue(bytes, classOf[ValidateRequest])) recoverWith {
        case t => ValidateReceiptsControllerImpl.logger.warn(s"Error reading as json bytes (base64 encoded): ${encoder.encode(bytes)}", t)
          Failure(t)
      })
      case LambdaRequest(None) => LambdaResponse(badRequest, Some(Left("Expected a json body")))
    }

  private def validate(triedRequest: Try[ValidateRequest]) = {
    triedRequest match {
      case Success(validateReceiptRequest) =>
        LambdaResponse(
          okCode,
          Some(Left(mapper.writeValueAsString(ValidateResponse(validateReceiptRequest.transactions.map(validateReceiptsValidator.validate))))))
      case Failure(_) => LambdaResponse(badRequest, Some(Left("Could not unmarshal json")))
    }
  }
}
