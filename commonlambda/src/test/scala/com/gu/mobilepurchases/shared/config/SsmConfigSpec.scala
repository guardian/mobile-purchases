package com.gu.mobilepurchases.shared.config

import com.gu.AwsIdentity
import com.gu.conf.SSMConfigurationLocation
import org.specs2.mutable.Specification

class SsmConfigSpec extends Specification {
  "SsmConfig" should {
    "load config from expected location" in {
      new SsmConfig().locationFunction(AwsIdentity("testApp", "testStack", "testStage", "eu-west-1")) must beEqualTo(
        SSMConfigurationLocation("/testApp/testStage/testStack", "eu-west-1"))
    }
  }
}
