package com.gu.mobilepurchases.shared.config

import com.gu.conf.{ ConfigurationLoader, SSMConfigurationLocation }
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.{ AppIdentity, AwsIdentity }
import com.typesafe.config.Config
import org.apache.logging.log4j.LogManager

case class SsmConfig(
    app: String,
    stack: String,
    stage: String,
    config: Config) {
}

object SsmConfigLoader {
  def locationFunction(lambdaname: String): PartialFunction[AppIdentity, SSMConfigurationLocation] = {
    case identity: AwsIdentity => SSMConfigurationLocation(s"/${identity.app}-${lambdaname}/${identity.stage}/${identity.stack}")
  }
  def apply(lambdaname: String, awsIdentitySupplier: () => AppIdentity = () => AppIdentity.whoAmI(defaultAppName = "mobile-purchases")): SsmConfig = {
    val identity: AppIdentity = Logging.logOnThrown(awsIdentitySupplier, "Error feature appidentity")
    val config: Config = Logging.logOnThrown(() => {
      ConfigurationLoader.load(identity)(locationFunction(lambdaname))
    }, "Error reading config from ssm")
    identity match {
      case awsIdentity: AwsIdentity => SsmConfig(awsIdentity.app, awsIdentity.stack, awsIdentity.stage, config)
      case _ => {
        val notAnAppMessage: String = "Not running an app"
        LogManager.getLogger("SsmConfigLoader").error(notAnAppMessage)
        throw new IllegalStateException(notAnAppMessage)
      }
    }

  }

}
