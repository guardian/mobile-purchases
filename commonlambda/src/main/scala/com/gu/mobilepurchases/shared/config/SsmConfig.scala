package com.gu.mobilepurchases.shared.config

import com.gu.conf.{ ConfigurationLoader, SSMConfigurationLocation }
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.{ AppIdentity, AwsIdentity }
import com.typesafe.config.Config

class SsmConfig() {
  val identity: AppIdentity = Logging.logOnThrown(() => AppIdentity.whoAmI(defaultAppName = "mobile-purchases"), "Error feature appidentity")
  val locationFunction: PartialFunction[AppIdentity, SSMConfigurationLocation] = {
    case identity: AwsIdentity => SSMConfigurationLocation(s"/${identity.app}/${identity.stage}/${identity.stack}")
  }
  val config: Config = Logging.logOnThrown(() => {

    ConfigurationLoader.load(identity)(locationFunction)
  }, "Error reading config from ssm")
}
