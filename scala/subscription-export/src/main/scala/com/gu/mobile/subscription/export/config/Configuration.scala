package com.gu.mobile.subscription.export.config

import com.gu.{ AppIdentity, AwsIdentity }
import com.gu.conf.{ ConfigurationLoader, SSMConfigurationLocation }
import com.typesafe.config.Config
import org.apache.logging.log4j.{ LogManager, Logger }

class Configuration {

  private val logger: Logger = LogManager.getLogger(this.getClass)

  val appName = Option(System.getenv("App")).getOrElse("mobile-purchases-subscription-export")

  private val conf: Config = {
    val identity = AppIdentity.whoAmI(defaultAppName = appName)
    logger.info(s"Tryling: ${identity}")
    ConfigurationLoader.load(identity = identity) {
      case AwsIdentity(app, stack, stage, _) =>
        val path = s"/$app/$stage/$stack"
        logger.info(s"Attempting to retrieve config from: $path")
        SSMConfigurationLocation(path = path)
    }
  }

  val hqlS3ScriptLocation = conf.getString("s3.hqlLocation")
  val s3LogLocation = conf.getString("s3.logBucket")
  val emrKeyPairName = conf.getString("emr.keyPair")
  val vpcSubnetId = conf.getString("vpc.subnetId")
}
