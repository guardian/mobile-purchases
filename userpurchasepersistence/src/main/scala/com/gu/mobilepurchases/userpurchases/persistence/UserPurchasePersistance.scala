package com.gu.mobilepurchases.userpurchases.persistence

import java.time.{ Clock, Instant, ZonedDateTime }

import com.amazonaws.auth.DefaultAWSCredentialsProviderChain
import com.amazonaws.services.dynamodbv2.{ AmazonDynamoDBAsync, AmazonDynamoDBAsyncClient }
import com.gu.mobilepurchases.shared.cloudwatch.{ CloudWatch, CloudWatchMetrics, Timer }
import com.gu.mobilepurchases.shared.external.Jackson.mapper
import com.gu.mobilepurchases.userpurchases.UserPurchase
import com.gu.scanamo.Scanamo.exec
import com.gu.scanamo.Table
import com.gu.scanamo.error.DynamoReadError
import com.gu.scanamo.ops.ScanamoOps
import com.gu.scanamo.query.UniqueKey
import com.gu.scanamo.syntax._
import org.apache.logging.log4j.{ LogManager, Logger }

import scala.util.{ Failure, Success, Try }

case class UserPurchaseConfig(app: String, stage: String, stack: String) {
  val userPurchasesTable: String = s"$app-$stage-$stack-user-purchases"
}

case class UserPurchasesByUserIdAndAppId(userId: String, appId: String, purchases: Set[UserPurchase])

object UserPurchasesByUserIdAndAppId {
  def apply(userPurchasesStringsByUserId: UserPurchasesStringsByUserIdColonAppId): UserPurchasesByUserIdAndAppId = {
    val userIdColonAppIdArray: Array[String] = userPurchasesStringsByUserId.userIdColonAppId.split(":", 2).filter((_: String).nonEmpty)
    userIdColonAppIdArray.length match {
      case 2 => UserPurchasesByUserIdAndAppId(
        userIdColonAppIdArray(0),
        userIdColonAppIdArray(1), mapper.readValue[List[UserPurchase]](userPurchasesStringsByUserId.purchases).toSet)
      case _ => throw new IllegalStateException("Not a userId:appId")
    }
  }
}

case class UserPurchasesStringsByUserIdColonAppId(userIdColonAppId: String, purchases: String, ttl: Long)

/**
 * ScanamaoUserPurchasesStringsByUserIdColonAppId helps testing as it doesn't seem valuable to test Scanamo
 */
trait ScanamaoUserPurchasesStringsByUserIdColonAppId {
  def put(userPurchasesStringsByUserIdColonAppId: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]]

  def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]]
}

object ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl {
  def apply(userPurchaseConfig: UserPurchaseConfig): ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl = new ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(
    Table[UserPurchasesStringsByUserIdColonAppId](userPurchaseConfig.userPurchasesTable),
    AmazonDynamoDBAsyncClient.asyncBuilder()
      .withCredentials(DefaultAWSCredentialsProviderChain.getInstance()).build()
  )
}

class ScanamaoUserPurchasesStringsByUserIdColonAppIdImpl(
    table: Table[UserPurchasesStringsByUserIdColonAppId],
    client: AmazonDynamoDBAsync
) extends ScanamaoUserPurchasesStringsByUserIdColonAppId {
  private val scanamoClient = exec[Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]]](
    client)(_: ScanamoOps[Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]]])

  def put(t: UserPurchasesStringsByUserIdColonAppId): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
    scanamoClient(table.put(t))
  }

  def get(key: UniqueKey[_]): Option[Either[DynamoReadError, UserPurchasesStringsByUserIdColonAppId]] = {
    scanamoClient(table.get(key))
  }
}

trait UserPurchasePersistence {
  def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]]

  def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]]
}
class UserPurchasePersistenceTransformer(clock: Clock) {
  def transform(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): UserPurchasesStringsByUserIdColonAppId = UserPurchasesStringsByUserIdColonAppId(
    s"${userPurchasesByUserId.userId}:${userPurchasesByUserId.appId}",
    mapper.writeValueAsString(userPurchasesByUserId.purchases), ZonedDateTime.now(clock).plusMonths(6).toEpochSecond)
}

class UserPurchasePersistenceImpl(
    scanamoClient: ScanamaoUserPurchasesStringsByUserIdColonAppId,
    userPurchasePersistenceTransformer: UserPurchasePersistenceTransformer,
    cloudWatch: CloudWatchMetrics
) extends UserPurchasePersistence {

  private val logger: Logger = LogManager.getLogger(classOf[UserPurchasePersistenceImpl])

  override def write(userPurchasesByUserId: UserPurchasesByUserIdAndAppId): Try[Option[UserPurchasesByUserIdAndAppId]] = {
    val writeTimer: Timer = cloudWatch.startTimer("purchases-write")
    if (userPurchasesByUserId.purchases.isEmpty) {
      Success(None)
    } else {
      scanamoClient.put(userPurchasePersistenceTransformer.transform(userPurchasesByUserId)) match {
        case Some(Right(u)) => {
          writeTimer.succeed
          Success(Some(UserPurchasesByUserIdAndAppId(u)))
        }
        case Some(Left(error)) => {
          writeTimer.fail
          Failure(new IllegalStateException(s"$error"))
        }
        case None => {
          writeTimer.succeed
          Success(None)
        }
      }
    }
  }

  override def read(userId: String, appId: String): Try[Option[UserPurchasesByUserIdAndAppId]] = {
    val readTimer: Timer = cloudWatch.startTimer("purchases-read")
    val key: String = s"$userId:$appId"
    scanamoClient.get('userIdColonAppId -> key) match {
      case Some(Right(u)) => {
        val userPurchasesByUserIdAndAppId: UserPurchasesByUserIdAndAppId = UserPurchasesByUserIdAndAppId(u)
        val somePurchases: Success[Some[UserPurchasesByUserIdAndAppId]] = Success(Some(userPurchasesByUserIdAndAppId))

        readTimer.succeed
        somePurchases

      }
      case Some(Left(error)) => {
        readTimer.fail
        Failure(new IllegalStateException(s"$error"))
      }
      case None => {
        logger.info(s"Missing $key")
        readTimer.succeed
        Success(None)
      }
    }
  }
}
