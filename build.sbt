import sbt.{Def, project}
import sbtassembly.MergeStrategy
import scalariform.formatter.preferences._

import scala.collection.immutable

val testAndCompileDependencies: String = "test->test;compile->compile"
val awsVersion: String = "1.11.375"
val simpleConfigurationVersion: String = "1.4.3"

// Force a version of jackson-databind that addresses this vulnerability:
// https://app.snyk.io/vuln/SNYK-JAVA-COMFASTERXMLJACKSONCORE-471943
// introduced via com.typesafe.play:play
val jacksonData: String = "2.10.1"

val scalaRoot = file("scala")

lazy val common = project.in(scalaRoot / "common")
  .disablePlugins(AssemblyPlugin)
  .settings(commonSettings("common"), libraryDependencies += "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData)

lazy val userPurchasePersistence = project.in(scalaRoot / "user-purchase-persistence").disablePlugins(AssemblyPlugin)
  .settings(commonSettings("user-purchase-persistence"), libraryDependencies += "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData)
  .dependsOn(common % testAndCompileDependencies)


lazy val iosValidateReceipts = project.in(scalaRoot / "ios-validate-receipts").enablePlugins(AssemblyPlugin).settings({
  val upgradeIosvalidatereceiptsTransitiveDependencies = List(
    "com.amazonaws" % "aws-java-sdk-ssm" % awsVersion
  )
  List(
    libraryDependencies ++= List(
      "com.gu" %% "simple-configuration-ssm" % simpleConfigurationVersion,
      "com.squareup.okhttp3" % "okhttp" % "3.10.0",
      "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData
    ),
    libraryDependencies ++= upgradeIosvalidatereceiptsTransitiveDependencies
  ) ++ commonAssemblySettings("ios-validate-receipts")
})
  .dependsOn(userPurchasePersistence % testAndCompileDependencies)

lazy val iosUserPurchases = project.in(scalaRoot / "ios-user-purchases").enablePlugins(AssemblyPlugin).settings(commonAssemblySettings("ios-user-purchases"))
  .dependsOn(userPurchasePersistence % testAndCompileDependencies)
  .settings(libraryDependencies += "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData)

lazy val googleOauth = project.in(scalaRoot / "google-oauth").enablePlugins(AssemblyPlugin)
  .settings(
    commonAssemblySettings("google-oauth"),
    libraryDependencies ++= List(
    "com.google.auth" % "google-auth-library-oauth2-http" % "0.15.0",
    "com.gu" %% "simple-configuration-ssm" % simpleConfigurationVersion,
    "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData
    )
  )
  .dependsOn(common % testAndCompileDependencies)

lazy val root = project
  .enablePlugins(RiffRaffArtifact).in(file("."))
  .aggregate(common, userPurchasePersistence, iosValidateReceipts, iosUserPurchases, googleOauth)
  .settings(
    fork := true, // was hitting deadlock, found similar complaints online, disabling concurrency helps: https://github.com/sbt/sbt/issues/3022, https://github.com/mockito/mockito/issues/1067
    scalaVersion := "2.12.5",
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    name := "mobile-purchases",
    riffRaffPackageType := file(".nothing"),
    riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
    riffRaffUploadManifestBucket := Option("riffraff-builds"),
    riffRaffManifestProjectName := s"Mobile::${name.value}",
    riffRaffArtifactResources += (assembly in iosValidateReceipts).value -> s"${(name in iosValidateReceipts).value}/${(assembly in iosValidateReceipts).value.getName}",
    riffRaffArtifactResources += (assembly in iosUserPurchases).value -> s"${(name in iosUserPurchases).value}/${(assembly in iosUserPurchases).value.getName}",
    riffRaffArtifactResources += (assembly in googleOauth).value -> s"${(name in googleOauth).value}/${(assembly in googleOauth).value.getName}",
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
    riffRaffArtifactResources += file("tsc-target/export-subscription-events-table.zip") -> s"mobile-purchases-export-subscription-events-table/export-subscription-events-table.zip",
    riffRaffArtifactResources += file("tsc-target/export-historical-data.zip") -> s"mobile-purchases-export-historical-data/export-historical-data.zip",
    riffRaffArtifactResources += file("cloudformation.yaml") -> s"mobile-purchases-cloudformation/cloudformation.yaml",
    riffRaffArtifactResources += file("exports-cloudformation.yaml") -> s"mobile-purchases-exports-cloudformation/exports-cloudformation.yaml",
  )

def commonAssemblySettings(module: String): immutable.Seq[Def.Setting[_]] = commonSettings(module) ++ List(
  publishArtifact in(Compile, packageDoc) := false,
  publishArtifact in packageDoc := false,
  assemblyMergeStrategy in assembly := {
    case "META-INF/MANIFEST.MF" => MergeStrategy.discard
    case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy
    case x =>
      val oldStrategy = (assemblyMergeStrategy in assembly).value
      oldStrategy(x)
  },
  assemblyJarName := s"${name.value}.jar"
)
def commonSettings(module: String): immutable.Seq[Def.Setting[_]] = {
  val specsVersion: String = "4.0.3"
  val log4j2Version: String = "2.11.0"
  val jacksonVersion: String = "2.9.6"
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
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    scalacOptions in Test ++= Seq("-Yrangepos"),
    libraryDependencies ++= Seq(
      "commons-io" % "commons-io" % "2.6",
      "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
      "com.amazonaws" % "aws-lambda-java-log4j2" % "1.1.0",
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
