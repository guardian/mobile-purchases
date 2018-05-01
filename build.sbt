import sbt.{Def, project}
import sbtassembly.MergeStrategy
import scalariform.formatter.preferences._

import scala.collection.immutable

val testAndCompileDependencies = "test->test;compile->compile"

lazy val commonlambda = project.disablePlugins(AssemblyPlugin).settings(commonSettings("commonlambda"))

lazy val userpurchasepersistence = project.disablePlugins(AssemblyPlugin)
  .settings(commonSettings("userpurchasepersistence"))
  .dependsOn(commonlambda % testAndCompileDependencies)

lazy val iosvalidatereceipts = project.enablePlugins(AssemblyPlugin).settings(commonAssemblySettings("iosvalidatereceipts"))
  .dependsOn(userpurchasepersistence % testAndCompileDependencies)

lazy val iosuserpurchases = project.enablePlugins(AssemblyPlugin).settings(commonAssemblySettings("iosuserpurchases"))
  .dependsOn(userpurchasepersistence % testAndCompileDependencies)



lazy val root = project.enablePlugins(RiffRaffArtifact).in(file(".")).aggregate(commonlambda, userpurchasepersistence, iosvalidatereceipts, iosuserpurchases)
  .settings(
    fork := true, // was hitting deadlock, found similar complaints online, disabling concurrency helps: https://github.com/sbt/sbt/issues/3022, https://github.com/mockito/mockito/issues/1067
    scalaVersion := "2.12.5",
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    name := "mobile-purchases",
    riffRaffPackageType := file(".nothing"),
    riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
    riffRaffUploadManifestBucket := Option("riffraff-builds"),
    riffRaffManifestProjectName := s"Mobile::${name.value}",
    riffRaffArtifactResources += (assembly in iosvalidatereceipts).value -> s"${(name in iosvalidatereceipts).value}/${(assembly in iosvalidatereceipts).value.getName}",
    riffRaffArtifactResources += (assembly in iosuserpurchases).value -> s"${(name in iosuserpurchases).value}/${(assembly in iosuserpurchases).value.getName}",
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
def commonSettings(module: String): immutable.Seq[Def.Setting[_]]  = {
  val awsVersion: String = "1.11.315"
  val specsVersion: String = "4.0.3"
  val log4j2Version: String = "2.10.0"
  val jacksonVersion: String = "2.9.5"
  val byteBuddyVersion = "1.8.8"
  List(
    conflictManager := ConflictManager.strict,
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
      "com.gu" %% "simple-configuration-ssm" % "1.4.3",
      "org.specs2" %% "specs2-core" % specsVersion % "test",
      "org.specs2" %% "specs2-scalacheck" % specsVersion % "test",
      "org.specs2" %% "specs2-mock" % specsVersion % "test",
      "com.squareup.okhttp3" % "okhttp" % "3.10.0"

    ),
    dependencyOverrides ++= List(
      "org.apache.logging.log4j" % "log4j-core" % log4j2Version,
      "org.apache.logging.log4j" % "log4j-api" % log4j2Version,
      "com.amazonaws" % "aws-java-sdk-ec2" % awsVersion,
      "com.amazonaws" % "aws-java-sdk-dynamodb" % awsVersion,
      "com.amazonaws" % "aws-java-sdk-ssm" % awsVersion,
      "com.amazonaws" % "aws-java-sdk-core" % awsVersion,
      "com.amazonaws" % "jmespath-java" % awsVersion,
      "com.github.mpilquist" %% "simulacrum" % "0.12.0",
      "commons-codec" % "commons-codec" % "1.11",
      "com.fasterxml.jackson.dataformat" % "jackson-dataformat-cbor" % jacksonVersion,
      "joda-time" % "joda-time" % "2.9.9",
      "com.fasterxml.jackson.core" % "jackson-core" % jacksonVersion,
      "com.fasterxml.jackson.core" % "jackson-annotations" % jacksonVersion,
      "com.fasterxml.jackson.core" % "jackson-databind" % jacksonVersion,
      "org.slf4j" % "slf4j-api" % "1.7.25",
      "commons-logging" % "commons-logging" % "1.2",
      "net.bytebuddy" % "byte-buddy" % byteBuddyVersion,
      "net.bytebuddy" % "byte-buddy-agent" % byteBuddyVersion,
      "org.objenesis" % "objenesis" % "2.6" ,
      "org.scala-lang.modules" %% "scala-xml" % "1.1.0",
      "org.typelevel" %% "cats-core" % "1.1.0",
      "org.typelevel" %% "cats-free" % "1.1.0",
      "org.typelevel" %% "cats-kernel" % "1.1.0",
      "org.typelevel" %% "cats-macros" % "1.1.0",
      "org.typelevel" %% "machinist" % "0.6.4",
      "software.amazon.ion" % "ion-java" % "1.1.2"
    ),
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