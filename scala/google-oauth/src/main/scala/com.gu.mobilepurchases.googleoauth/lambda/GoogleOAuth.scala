package com.gu.mobilepurchases.googleoauth.lambda

import java.io.{ByteArrayInputStream, InputStream, OutputStream}
import java.nio.charset.StandardCharsets
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{PutObjectRequest, PutObjectResponse}
import com.amazonaws.services.lambda.runtime.Context
import com.google.auth.oauth2.{AccessToken, GoogleCredentials}
import com.gu.conf.{ConfigurationLoader, SSMConfigurationLocation}
import com.gu.{AppIdentity, AwsIdentity}
import com.typesafe.config.Config
import org.apache.logging.log4j.LogManager
import scala.util.{Failure, Success, Try}

object GoogleOAuth {

  private val logger = LogManager.getLogger

  def accessToken(): Unit = {

    val attempt = for {
      tokenAttempt <- refreshToken
      uploadAttempt <- S3Uploader.uploadTokenToS3(tokenAttempt)
    } yield uploadAttempt

    attempt match {
      case Success(_) =>
        logger.info("Successfully refreshed and uploaded a new token")
      case Failure(error) => {
        logger.error(s"Failed to refresh or upload a new token due to: $error")
        throw error
      }
    }
  }

  def refreshToken: Try[AccessToken] = Try {
    val credentials = GoogleCredentials
      .fromStream(new ByteArrayInputStream(fetchConfiguration().getString("google.serviceAccountJson").getBytes))
      .createScoped("https://www.googleapis.com/auth/androidpublisher")
    credentials.refresh()
    credentials.getAccessToken
  }

  def fetchConfiguration(): Config = {
    val credentialsProvider = DefaultCredentialsProvider.builder().build()
    AppIdentity.whoAmI(defaultAppName = "google-oauth-lambda", credentialsProvider) match {
      case Success(identity) =>
        ConfigurationLoader.load(identity, credentialsProvider) { case AwsIdentity(_, _, stage, _) =>
          SSMConfigurationLocation(s"/mobile-purchases/$stage/google-oauth-lambda", "eu-west-1")
        }
      case Failure(cause) => throw new Exception(s"Could not fetch configuration, cause: ${cause.getMessage}")
    }
  }

  def handler(input: InputStream, output: OutputStream, context: Context): Unit = {
    accessToken()
  }

}

object S3Uploader {

  private val s3Client: S3Client = S3Client.builder().build()

  def accessTokenAsJsonString(accessToken: AccessToken): String =
    s"""{"token":"${accessToken.getTokenValue}","expiry":"${accessToken.getExpirationTime}"}"""

  def uploadTokenToS3(accessToken: AccessToken): Try[PutObjectResponse] = Try {
    val bucket = "gu-mobile-access-tokens"
    val key = s"${System.getenv("Stage")}/google-play-developer-api/access_token.json"
    val content = accessTokenAsJsonString(accessToken).getBytes(StandardCharsets.UTF_8)

    val request = PutObjectRequest
      .builder()
      .bucket(bucket)
      .key(key)
      .build()

    s3Client.putObject(request,  RequestBody.fromBytes(content))
  }

}

object Debug extends App {
  GoogleOAuth.accessToken()
}
