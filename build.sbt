import sbtassembly.MergeStrategy

lazy val commonlambda = project.disablePlugins(AssemblyPlugin).settings(commonSettings("commonlambda")).settings(
  resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
  scalacOptions in Test ++= Seq("-Yrangepos")
)

lazy val iosvalidatereceipts = project.enablePlugins(AssemblyPlugin).dependsOn(commonlambda  % "test->test;compile->compile").settings(commonAssemblySettings("iosvalidatereceipts")).settings(
  scalacOptions in Test ++= Seq("-Yrangepos"),
  assemblyMergeStrategy in assembly := {
    case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy
    case x => (assemblyMergeStrategy in assembly).value(x)
  }
)
lazy val iosuserpurchases = project.enablePlugins(AssemblyPlugin).dependsOn(commonlambda  % "test->test;compile->compile").settings(commonAssemblySettings("iosuserpurchases")).settings(
  scalacOptions in Test ++= Seq("-Yrangepos"),
  assemblyMergeStrategy in assembly := {
    case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy
    case x => (assemblyMergeStrategy in assembly).value(x)
  }
)



lazy val root = project.enablePlugins(RiffRaffArtifact).in(file(".")).aggregate(commonlambda, iosvalidatereceipts, iosuserpurchases)
  .settings(
    scalaVersion := "2.12.5",
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    name := "mobile-purchases",
    riffRaffPackageType := file(".nothing"),
    riffRaffUploadArtifactBucket := Option("riffraff-artifact"),
    riffRaffUploadManifestBucket := Option("riffraff-builds"),
    riffRaffManifestProjectName := s"Mobile::${name.value}",
    riffRaffArtifactResources += (assembly in iosvalidatereceipts).value -> s"${(name in iosvalidatereceipts).value}/${(assembly in iosvalidatereceipts).value.getName}",
    riffRaffArtifactResources += (assembly in iosuserpurchases).value -> s"${(name in iosuserpurchases).value}/${(assembly in iosuserpurchases).value.getName}"

  )

def commonAssemblySettings(module: String) = commonSettings(module) ++ List(
  publishArtifact in(Compile, packageDoc) := false,
  publishArtifact in packageDoc := false,
  assemblyMergeStrategy in assembly := {
    case "META-INF/MANIFEST.MF" => MergeStrategy.discard
    case x =>
      val oldStrategy = (assemblyMergeStrategy in assembly).value
      oldStrategy(x)
  },
  assemblyJarName := s"${name.value}.jar"
)

def commonSettings(module: String) = List(
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
    "org.specs2" %% "specs2-core" % "4.0.2" % "test"

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
    "-Ywarn-dead-code"
  )


)