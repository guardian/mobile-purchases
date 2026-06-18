import sbt.{Def, project}
import sbtassembly.MergeStrategy
import sbtassembly.AssemblyPlugin.autoImport._

import scala.collection.immutable

ThisBuild / libraryDependencySchemes += "org.scala-lang.modules" % "scala-xml" % VersionScheme.Always

ThisBuild / dependencyOverrides ++= Seq(
  "io.netty" % "netty-codec-http2" % "4.1.135.Final",
  "io.netty" % "netty-codec-http" % "4.1.135.Final",
  "io.netty" % "netty-codec" % "4.1.135.Final",
  "io.netty" % "netty-common" % "4.1.135.Final",
  "io.netty" % "netty-buffer" % "4.1.135.Final",
  "io.netty" % "netty-transport" % "4.1.135.Final",
  "io.netty" % "netty-handler" % "4.1.135.Final"
)

val testAndCompileDependencies: String = "test->test;compile->compile"
val simpleConfigurationVersion: String = "1.6.2"

val jacksonData: String = "2.18.2"

val scalaRoot = file("scala")

val awsVersion2: String = "2.37.0"

scalaVersion := "2.13.16"

lazy val common = project.in(scalaRoot / "common")
  .disablePlugins(AssemblyPlugin)
  .settings(commonSettings("common"), libraryDependencies += "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData)

lazy val userPurchasePersistence = project.in(scalaRoot / "user-purchase-persistence").disablePlugins(AssemblyPlugin)
  .settings(commonSettings("user-purchase-persistence"), libraryDependencies += "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData)
  .dependsOn(common % testAndCompileDependencies)

lazy val googleOauth = project.in(scalaRoot / "google-oauth").enablePlugins(AssemblyPlugin)
  .settings(
    commonAssemblySettings("google-oauth"),
    libraryDependencies ++= List(
      "com.google.auth" % "google-auth-library-oauth2-http" % "1.15.0",
      "com.gu" %% "simple-configuration-ssm" % simpleConfigurationVersion,
      "com.fasterxml.jackson.core" % "jackson-databind" % jacksonData
    )
  )
  .dependsOn(common % testAndCompileDependencies)

lazy val root = project
  .in(file("."))
  .aggregate(common, googleOauth)
  .settings(
    fork := true,
    name := "mobile-purchases",
  )

def commonAssemblySettings(module: String): immutable.Seq[Def.Setting[_]] = commonSettings(module) ++ List(
  Compile / packageDoc / publishArtifact := false,
  assembly / assemblyMergeStrategy := {
    case PathList("META-INF", "versions", xs @ _*) => MergeStrategy.first
    case PathList("META-INF", "org", "apache", "logging", "log4j", "core", "config", "plugins", "Log4j2Plugins.dat") => MergeStrategy.concat
    case PathList("META-INF", "services", xs @ _*) => MergeStrategy.concat
    case "META-INF/MANIFEST.MF" => MergeStrategy.discard
    case "module-info.class" => MergeStrategy.discard
    case x => MergeStrategy.first
  },
  assemblyJarName := s"${name.value}.jar",
  packageOptions += Package.ManifestAttributes("Multi-Release" -> "true")
)

def commonSettings(module: String): immutable.Seq[Def.Setting[_]] = {
  val specsVersion: String = "4.19.2"
  val log4j2Version: String = "2.17.2"
  val jacksonVersion: String = "2.18.2"
  List(
    fork := true,
    Test / scalacOptions ++= Seq("-Yrangepos"),
    libraryDependencies ++= Seq(
      "software.amazon.awssdk" % "s3" % awsVersion2,
      "software.amazon.awssdk" % "ec2" % awsVersion2,
      "software.amazon.awssdk" % "dynamodb" % awsVersion2,
      "software.amazon.awssdk" % "cloudwatch" % awsVersion2,
      "software.amazon.awssdk" % "core" % awsVersion2,
      "software.amazon.awssdk" % "lambda" % awsVersion2,
      "commons-io" % "commons-io" % "2.18.0",
      "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
      "org.apache.logging.log4j" % "log4j-slf4j-impl" % log4j2Version,
      "org.apache.logging.log4j" % "log4j-api" % log4j2Version,
      "com.fasterxml.jackson.module" %% "jackson-module-scala" % jacksonVersion,
      "com.fasterxml.jackson.dataformat" % "jackson-dataformat-cbor" % jacksonVersion,
      "org.scanamo" %% "scanamo" % "1.0.0-M23",
      "com.gu" %% "simple-configuration-core" % simpleConfigurationVersion,
      "org.specs2" %% "specs2-core" % specsVersion % "test",
      "org.specs2" %% "specs2-scalacheck" % specsVersion % "test",
      "org.specs2" %% "specs2-mock" % specsVersion % "test"
    ),
    name := s"mobile-purchases-$module",
    organization := "com.gu",
    description := "Validate Receipts",
    version := "1.0",
    scalacOptions ++= Seq(
      "-deprecation",
      "-encoding", "UTF-8",
      "-Ywarn-dead-code",
      "-Xfatal-warnings",
    )
  )
}