package com.gu.mobilepurchases.config

import com.gu.conf.{ConfigurationLoader, SSMConfigurationLocation}
import com.gu.mobilepurchases.external.Logging
import com.gu.{AppIdentity, AwsIdentity}

class SsmConfig {
  val identity: AppIdentity = Logging.logOnThrown(() => AppIdentity.whoAmI(defaultAppName = "mobile-purchases"), "Error feature appidentity")
  val config = Logging.logOnThrown(() => ConfigurationLoader.load(identity) {
    case identity: AwsIdentity => SSMConfigurationLocation.default(identity)
  }, "Error reading config from ssm")
}
