package com.gu.mobilepurchases.shared.config

import com.gu.conf.{ ConfigurationLoader, SSMConfigurationLocation }
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.{ AppIdentity, AwsIdentity }
import com.typesafe.config.Config

class SsmConfig(awsIdentitySupplier: () => AppIdentity = () => AppIdentity.whoAmI(defaultAppName = "mobile-purchases")) {
  val identity: AppIdentity = Logging.logOnThrown(awsIdentitySupplier, "Error feature appidentity")
  val stage: String = identity match {
    case awsIdentity: AwsIdentity => awsIdentity.stage
    case _                        => ""
  }
  val locationFunction: PartialFunction[AppIdentity, SSMConfigurationLocation] = {
    case identity: AwsIdentity => SSMConfigurationLocation(s"/${identity.app}/${identity.stage}/${identity.stack}")
  }
  lazy val config: Config = Logging.logOnThrown(() => {

    ConfigurationLoader.load(identity)(locationFunction)
  }, "Error reading config from ssm")
}
