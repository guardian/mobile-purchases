package com.gu.mobile.subscription.export

import com.amazonaws.auth.{ AWSCredentialsProviderChain, DefaultAWSCredentialsProviderChain }
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.regions.{ DefaultAwsRegionProviderChain, Regions }
import com.amazonaws.services.elasticmapreduce.{ AmazonElasticMapReduceAsyncClientBuilder, AmazonElasticMapReduceClientBuilder }
import com.amazonaws.services.elasticmapreduce.model.transform.JobFlowInstancesDetailMarshaller
import com.amazonaws.services.elasticmapreduce.model.{ Application, JobFlowInstancesConfig, RunJobFlowRequest, StepConfig }
import com.amazonaws.services.elasticmapreduce.util.StepFactory
import com.gu.mobile.subscription.export.config.Configuration
import org.apache.logging.log4j.{ LogManager, Logger }

object Lambda {

  private val logger: Logger = LogManager.getLogger(this.getClass)

  val credentials = new AWSCredentialsProviderChain(
    new ProfileCredentialsProvider("mobile"),
    DefaultAWSCredentialsProviderChain.getInstance()
  )

  val setpFactory = new StepFactory()

  val config = new Configuration()

  val stage = Option(System.getenv("Stage")).getOrElse("CODE")

  val enableDebuggingStep = new StepConfig()
    .withName("Enable debugging")
    .withActionOnFailure("TERMINATE_JOB_FLOW")
    .withHadoopJarStep(setpFactory.newEnableDebuggingStep())

  val installHiveStep = new StepConfig()
    .withName("Install Hive")
    .withActionOnFailure("TERMINATE_JOB_FLOW")
    .withHadoopJarStep(setpFactory.newInstallHiveStep())

  val hive = new Application().withName("Hive")

  def handler(): Unit = {

    logger.info("Setting up cluster")

    val emr = AmazonElasticMapReduceClientBuilder.standard()
      .withCredentials(credentials)
      .withRegion(Regions.EU_WEST_1)
      .build()

    logger.info(s"Set up cluster. script: ${config.hqlS3ScriptLocation}, stage: $stage")
    val runScriptStep = new StepConfig()
      .withName("Export data")
      .withActionOnFailure("TERMINATE_JOB_FLOW")
      .withHadoopJarStep(setpFactory.newRunHiveScriptStep(config.hqlS3ScriptLocation, "-d", s"stage=$stage"))

    logger.info("Run job flow request")

    val runJobFlowRequest = new RunJobFlowRequest()
      .withName("Export subs via hive")
      .withApplications(hive)
      .withSteps(enableDebuggingStep, installHiveStep, runScriptStep)
      .withReleaseLabel("emr-5.23.0")
      .withLogUri(config.s3LogLocation)
      .withServiceRole("EMR_DefaultRole")
      .withJobFlowRole("EMR_EC2_DefaultRole")
      .withInstances(new JobFlowInstancesConfig()
        .withEc2SubnetId("subnet-75859517") //TODO do not push
        .withEc2KeyName("NathanielEmrHome") //TODO do not push
        .withInstanceCount(3) //Fsck knows
        .withKeepJobFlowAliveWhenNoSteps(true)
        .withMasterInstanceType("m4.large")
        .withSlaveInstanceType("m4.large")
      )

    val result = emr.runJobFlow(runJobFlowRequest)
    logger.info(s"Result: ${result.toString}")
    emr.shutdown()
  }
}
