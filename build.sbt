lazy val iosvalidatereceipts = project
  .settings(commonSettings("iosvalidatereceipts"))
  .settings(
    libraryDependencies ++= Seq(
      "com.amazonaws" % "aws-lambda-java-core" % "1.2.0",
      "commons-io" % "commons-io" % "2.6",
      "com.fasterxml.jackson.module" %% "jackson-module-scala" % "2.9.4"
    )
  )
lazy val root = project.in(file(".")).aggregate(iosvalidatereceipts)
  .settings(
    scalaVersion := "2.12.5",
    resolvers += "Guardian Platform Bintray" at "https://dl.bintray.com/guardian/platforms",
    name := "mobile-purchases"
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