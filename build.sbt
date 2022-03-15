import sbt.{Def, project}
import scalariform.formatter.preferences._

import scala.collection.immutable

val testAndCompileDependencies: String = "test->test;compile->compile"
val awsVersion: String = "1.11.375"
val simpleConfigurationVersion: String = "1.5.5"

lazy val root = project
  .enablePlugins(RiffRaffArtifact).in(file("."))
  .settings(
    fork := true, // was hitting deadlock, found similar complaints online, disabling concurrency helps: https://github.com/sbt/sbt/issues/3022, https://github.com/mockito/mockito/issues/1067
    scalaVersion := "2.12.5",
    name := "mobile-purchases",
    riffRaffPackageType := file(".nothing"),
    riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
    riffRaffUploadManifestBucket := Option("riffraff-builds"),
    riffRaffManifestProjectName := s"Mobile::${name.value}",
    riffRaffArtifactResources += file("tsc-target/google-pubsub.zip") -> s"mobile-purchases-google-pubsub/google-pubsub.zip",
    riffRaffArtifactResources += file("tsc-target/apple-pubsub.zip") -> s"mobile-purchases-apple-pubsub/apple-pubsub.zip",
    riffRaffArtifactResources += file("tsc-target/google-subscription-status.zip") -> s"mobile-purchases-google-subscription-status/google-subscription-status.zip",
    riffRaffArtifactResources += file("tsc-target/apple-subscription-status.zip") -> s"mobile-purchases-apple-subscription-status/apple-subscription-status.zip",
    riffRaffArtifactResources += file("tsc-target/apple-link-user-subscription.zip") -> s"mobile-purchases-apple-link-user-subscription/apple-link-user-subscription.zip",
    riffRaffArtifactResources += file("tsc-target/google-link-user-subscription.zip") -> s"mobile-purchases-google-link-user-subscription/google-link-user-subscription.zip",
    riffRaffArtifactResources += file("tsc-target/delete-user-subscription.zip") -> s"mobile-purchases-delete-user-subscription/delete-user-subscription.zip",
    riffRaffArtifactResources += file("tsc-target/google-update-subscriptions.zip") -> s"mobile-purchases-google-update-subscriptions/google-update-subscriptions.zip",
    riffRaffArtifactResources += file("tsc-target/apple-update-subscriptions.zip") -> s"mobile-purchases-apple-update-subscriptions/apple-update-subscriptions.zip",
    riffRaffArtifactResources += file("tsc-target/user-subscriptions.zip") -> s"mobile-purchases-user-subscriptions/user-subscriptions.zip",
    riffRaffArtifactResources += file("tsc-target/export-subscription-tables.zip") -> s"mobile-purchases-export-subscription-tables/export-subscription-tables.zip",
    riffRaffArtifactResources += file("tsc-target/export-subscription-table-v2.zip") -> s"mobile-purchases-export-subscription-table-v2/export-subscription-table-v2.zip",
    riffRaffArtifactResources += file("tsc-target/export-subscription-events-table.zip") -> s"mobile-purchases-export-subscription-events-table/export-subscription-events-table.zip",
    riffRaffArtifactResources += file("tsc-target/export-historical-data.zip") -> s"mobile-purchases-export-historical-data/export-historical-data.zip",
    riffRaffArtifactResources += file("tsc-target/apple-revalidate-receipts.zip") -> s"mobile-purchases-apple-revalidate-receipts/apple-revalidate-receipts.zip",
    riffRaffArtifactResources += file("cloudformation.yaml") -> s"mobile-purchases-cloudformation/cloudformation.yaml",
    riffRaffArtifactResources += file("exports-cloudformation.yaml") -> s"mobile-purchases-exports-cloudformation/exports-cloudformation.yaml",
  )

def commonSettings(module: String): immutable.Seq[Def.Setting[_]] = {
  val specsVersion: String = "4.0.3"
  val log4j2Version: String = "2.17.1"
  val jacksonVersion: String = "2.13.0"
  val upgradeTransitiveDependencies = Seq(
    "com.amazonaws" % "aws-java-sdk-ec2" % awsVersion,
    "com.amazonaws" % "aws-java-sdk-dynamodb" % awsVersion,
    "com.amazonaws" % "aws-java-sdk-core" % awsVersion,
    "com.fasterxml.jackson.dataformat" % "jackson-dataformat-cbor" % jacksonVersion,
    "org.apache.logging.log4j" % "log4j-api" % log4j2Version
  )
  List(
    scalariformPreferences := scalariformPreferences.value
      .setPreference(AlignSingleLineCaseStatements, true)
      .setPreference(DoubleIndentConstructorArguments, true)
      .setPreference(DanglingCloseParenthesis, Preserve),
    fork := true, // was hitting deadlock, found similar complaints online, disabling concurrency helps: https://github.com/sbt/sbt/issues/3022, https://github.com/mockito/mockito/issues/1067
    Test / scalacOptions ++= Seq("-Yrangepos"),
    libraryDependencies ++= Seq(
      "commons-io" % "commons-io" % "2.6",
      "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
      "com.amazonaws" % "aws-lambda-java-log4j2" % "1.5.0",
      "com.amazonaws" % "aws-java-sdk-cloudwatch" % awsVersion,
      "org.apache.logging.log4j" % "log4j-slf4j-impl" % log4j2Version,
      "com.fasterxml.jackson.module" %% "jackson-module-scala" % jacksonVersion,
      "com.gu" %% "scanamo" % "1.0.0-M6",
      "com.gu" %% "simple-configuration-core" % simpleConfigurationVersion,
      "org.specs2" %% "specs2-core" % specsVersion % "test",
      "org.specs2" %% "specs2-scalacheck" % specsVersion % "test",
      "org.specs2" %% "specs2-mock" % specsVersion % "test"
    ),
    libraryDependencies ++= upgradeTransitiveDependencies,
    name := s"mobile-purchases-$module",
    organization := "com.gu",
    description := "Validate Receipts",
    version := "1.0",
    scalaVersion := "2.12.6",
    scalacOptions ++= Seq(
      "-deprecation",
      "-encoding", "UTF-8",
      "-target:jvm-1.8",
      "-Ywarn-dead-code",
      "-Xfatal-warnings",
      "-Ypartial-unification"
    )

  )
}
