package com.gu.mobile.subscription.export

import com.amazonaws.auth.{ AWSCredentialsProviderChain, DefaultAWSCredentialsProviderChain }
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.DefaultAwsRegionProviderChain
import org.apache.logging.log4j.{ LogManager, Logger }

object Lambda {

  private val logger: Logger = LogManager.getLogger(this.getClass)

  val credentials = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("mobile"),
    DefaultAWSCredentialsProviderChain.getInstance()
  )

}
