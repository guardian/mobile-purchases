import sbtassembly.MergeStrategy

lazy val iosvalidatereceipts = project.settings(commonSettings("iosvalidatereceipts")).settings(
  libraryDependencies ++= Seq(
    "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
    "commons-io" % "commons-io" % "2.6",
    "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.9.4",
    "com.amazonaws" % "aws-lambda-java-log4j2" % "1.1.0",
    "com.amazonaws" % "aws-java-sdk-dynamodb" % "1.11.304",
    "org.apache.logging.log4j" % "log4j-core" % "2.11.0",
    "org.apache.logging.log4j" % "log4j-api" % "2.11.0",
    "org.specs2" %% "specs2-core" % "4.0.2" % "test"

  ),
  scalacOptions in Test ++= Seq("-Yrangepos"),

  assemblyMergeStrategy in assembly := {
    case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy
    case x => (assemblyMergeStrategy in assembly).value(x)
  }


)
lazy val root = project.enablePlugins(RiffRaffArtifact).in(file(".")).aggregate(iosvalidatereceipts)
  .settings(
    scalaVersion := "2.12.5",
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    name := "mobile-purchases",

    riffRaffPackageType := file(".nothing"),
    riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
    riffRaffUploadManifestBucket := Option("riffraff-builds"),
    riffRaffManifestProjectName := s"Mobile::${name.value}",
    riffRaffArtifactResources += (assembly in iosvalidatereceipts).value -> s"${(name in iosvalidatereceipts).value}/${(assembly in iosvalidatereceipts).value.getName}",
    riffRaffArtifactResources += (file("cloudformation.yaml"), s"mobile-purchases-cloudformation/cloudformation.yaml")

  )

def commonSettings(module: String) = List(
  name := s"mobile-purchases-$module",
  organization := "com.gu",
  description := "Validate Receipts",
  version := "1.0",
  scalaVersion := "2.12.5",
  scalacOptions ++= Seq(
    "-deprecation",
    "-encoding", "UTF-8",
    "-target:jvm-1.8",
    "-Ywarn-dead-code"
  ),
  assemblyMergeStrategy in assembly := {
    case "META-INF/MANIFEST.MF" => MergeStrategy.discard
    case x =>
      val oldStrategy = (assemblyMergeStrategy in assembly).value
      oldStrategy(x)
  },
  publishArtifact in(Compile, packageDoc) := false,
  publishArtifact in packageDoc := false,
  assemblyJarName := s"${name.value}.jar"
)