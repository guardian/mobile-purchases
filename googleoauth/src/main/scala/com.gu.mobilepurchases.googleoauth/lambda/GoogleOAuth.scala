import java.io.{ ByteArrayInputStream, InputStream, OutputStream }

import com.amazonaws.services.lambda.runtime.Context
import com.google.auth.oauth2.GoogleCredentials
import com.gu.conf.{ ConfigurationLoader, SSMConfigurationLocation }
import com.gu.{ AppIdentity, AwsIdentity }
import com.typesafe.config.Config
import org.apache.logging.log4j.LogManager

object GoogleOAuth {

  def accessToken(): Unit = {

    val logger = LogManager.getLogger

    val credentials = GoogleCredentials
      .fromStream(new ByteArrayInputStream(fetchConfiguration.getString("google.serviceAccountJson").getBytes))
      .createScoped("https://www.googleapis.com/auth/androidpublisher")

    credentials.refresh

    logger.info(s"Token will expire at ${credentials.getAccessToken().getExpirationTime}")

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

object Debug extends App {
  GoogleOAuth.accessToken()
}