package com.gu.mobilepurchases.config

import com.gu.conf.{ConfigurationLoader, SSMConfigurationLocation}
import com.gu.mobilepurchases.shared.external.Logging
import com.gu.{AppIdentity, AwsIdentity}

class SsmConfig {
  val identity: AppIdentity = Logging.logOnThrown(() => AppIdentity.whoAmI(defaultAppName = "mobile-purchases"), "Error feature appidentity")
  val config = Logging.logOnThrown(() => ConfigurationLoader.load(identity) {
    case identity: AwsIdentity => SSMConfigurationLocation(s"/${identity.app}/${identity.stage}/${identity.stack}")
  }, "Error reading config from ssm")
}
