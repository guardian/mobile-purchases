package com.gu.mobilepurchases.config

import com.gu.conf.{ConfigurationLoader, SSMConfigurationLocation}
import com.gu.{AppIdentity, AwsIdentity}

class SsmConfig {
  val identity = AppIdentity.whoAmI(defaultAppName = "mobile-purchases")
  val config = ConfigurationLoader.load(identity) {
    case identity: AwsIdentity => SSMConfigurationLocation.default(identity)
  }
}
