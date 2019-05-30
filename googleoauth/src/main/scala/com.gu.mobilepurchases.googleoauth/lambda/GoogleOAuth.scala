package com.gu.mobilepurchases.googleoauth.lambda

import java.io.{ ByteArrayInputStream, InputStream, OutputStream }

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.PutObjectResult
import com.google.auth.oauth2.{ AccessToken, GoogleCredentials }
import com.gu.conf.{ ConfigurationLoader, SSMConfigurationLocation }
import com.gu.{ AppIdentity, AwsIdentity }
import com.typesafe.config.Config
import org.apache.logging.log4j.LogManager

import scala.util.{ Failure, Success, Try }

object GoogleOAuth {

  val logger = LogManager.getLogger

  def accessToken(): Unit = for {
    tokenAttempt <- refreshToken
    uploadAttempt <- Try(S3Uploader.uploadTokenToS3(tokenAttempt))
  } yield {
    uploadAttempt match {
      case Success(_) => logger.info("Successfully refreshed and uploaded a new token")
      case Failure(error) => {
        logger.error(s"Failed to refresh or upload a new token due to: $error")
        throw error
      }
    }
  }

  def refreshToken: Try[AccessToken] = Try {
    val credentials = GoogleCredentials
      .fromStream(new ByteArrayInputStream(fetchConfiguration.getString("google.serviceAccountJson").getBytes))
      .createScoped("https://www.googleapis.com/auth/androidpublisher")
    credentials.refresh()
    credentials.getAccessToken
  }

  def fetchConfiguration(): Config = {
    val identity = AppIdentity.whoAmI(defaultAppName = "google-oauth-lambda")
    ConfigurationLoader.load(identity) {
      case AwsIdentity(_, _, stage, _) => SSMConfigurationLocation(s"/mobile-purchases/$stage/google-oauth-lambda")
    }
  }

  def handler(input: InputStream, output: OutputStream, context: Context): Unit = {
    accessToken()
  }

}

object S3Uploader {

  val s3Client = AmazonS3ClientBuilder.defaultClient()

  def accessTokenAsJsonString(accessToken: AccessToken): String = s"""{"token":"${accessToken.getTokenValue}","expiry":"${accessToken.getExpirationTime}"}"""

  def uploadTokenToS3(accessToken: AccessToken): Try[PutObjectResult] = Try {
    s3Client.putObject(
      "gu-mobile-access-tokens",
      s"${System.getenv("Stage")}/google-play-developer-api/access_token.json",
      accessTokenAsJsonString(accessToken)
    )
  }

}

object Debug extends App {
  GoogleOAuth.accessToken()
}