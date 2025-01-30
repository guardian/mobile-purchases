import sbt.{Def, project}
import sbtassembly.MergeStrategy
import scalariform.formatter.preferences._

import scala.collection.immutable

val testAndCompileDependencies: String = "test->test;compile->compile"
val awsVersion: String = "1.11.375"
val simpleConfigurationVersion: String = "1.6.2"

val jacksonData: String = "2.15.0"

val scalaRoot = file("scala")

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
    fork := true, // was hitting deadlock, found similar complaints online, disabling concurrency helps: https://github.com/sbt/sbt/issues/3022, https://github.com/mockito/mockito/issues/1067
    name := "mobile-purchases",
  )

def commonAssemblySettings(module: String): immutable.Seq[Def.Setting[_]] = commonSettings(module) ++ List(
  Compile / packageDoc / publishArtifact := false,
  assembly / assemblyMergeStrategy := {
    case "META-INF/MANIFEST.MF" => MergeStrategy.discard
    case "META-INF/org/apache/logging/log4j/core/config/plugins/Log4j2Plugins.dat" => new MergeFilesStrategy
    case "module-info.class" => MergeStrategy.discard // See: https://stackoverflow.com/a/55557287
    case x => MergeStrategy.first
  },
  assemblyJarName := s"${name.value}.jar"
)
def commonSettings(module: String): immutable.Seq[Def.Setting[_]] = {
  val specsVersion: String = "4.19.2" // Not possible to upgrade to 5.*.* unless moving to Scala 3.
  val log4j2Version: String = "2.17.1"
  val jacksonVersion: String = "2.15.0"
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
      "org.scanamo" %% "scanamo" % "1.0.0-M23",
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
    scalacOptions ++= Seq(
      "-deprecation",
      "-encoding", "UTF-8",
      "-Ywarn-dead-code",
      "-Xfatal-warnings",
    )
  )
}
