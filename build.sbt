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
    scalaVersion := "2.12.5",
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    name := "mobile-purchases",
    riffRaffPackageType := file(".nothing"),
    riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
    riffRaffUploadManifestBucket := Option("riffraff-builds"),
    riffRaffManifestProjectName := s"Mobile::${name.value}",
    riffRaffArtifactResources += (assembly in iosvalidatereceipts).value -> s"${(name in iosvalidatereceipts).value}/${(assembly in iosvalidatereceipts).value.getName}",
    riffRaffArtifactResources += (assembly in iosuserpurchases).value -> s"${(name in iosuserpurchases).value}/${(assembly in iosuserpurchases).value.getName}",
    parallelExecution := false
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
def commonSettings(module: String): immutable.Seq[Def.Setting[_]]  = List(
  scalariformPreferences := scalariformPreferences.value
    .setPreference(AlignSingleLineCaseStatements, true)
    .setPreference(DoubleIndentConstructorArguments, true)
    .setPreference(DanglingCloseParenthesis, Preserve),
    fork := true, // was hitting deadlock, found similar complaints online, disabling concurrency helps: https://github.com/sbt/sbt/issues/3022, https://github.com/mockito/mockito/issues/1067
  resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
  scalacOptions in Test ++= Seq("-Yrangepos"),
  libraryDependencies ++= Seq(
    "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
    "commons-io" % "commons-io" % "2.6",
    "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.9.4",
    "com.amazonaws" % "aws-lambda-java-log4j2" % "1.1.0",
    "com.amazonaws" % "aws-java-sdk-dynamodb" % "1.11.307",
    "com.amazonaws" % "aws-java-sdk-ssm" % "1.11.307",
    "com.amazonaws" % "aws-java-sdk-ec2" % "1.11.307",
    "com.fasterxml.jackson.dataformat" % "jackson-dataformat-cbor" % "2.9.4",
    "org.apache.logging.log4j" % "log4j-core" % "2.11.0",
    "org.apache.logging.log4j" % "log4j-api" % "2.11.0",
    "com.gu" %% "simple-configuration-ssm" % "1.4.3",
    "org.apache.logging.log4j" % "log4j-slf4j-impl" % "2.11.0",
    "org.specs2" %% "specs2-core" % "4.0.3" % "test",
    "org.specs2" %% "specs2-scalacheck" % "4.0.3" % "test",
    "org.specs2" %% "specs2-mock" % "4.0.3" % "test",
    "com.gu" %% "scanamo" % "1.0.0-M6"

  ),
  name := s"mobile-purchases-$module",
  organization := "com.gu",
  description := "Validate Receipts",
  version := "1.0",
  scalaVersion := "2.12.5",
  scalacOptions ++= Seq(
    "-deprecation",
    "-encoding", "UTF-8",
    "-target:jvm-1.8",
    "-Ywarn-dead-code",
    "-Xfatal-warnings",
    "-Ypartial-unification"
  )

)