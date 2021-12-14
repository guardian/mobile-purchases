addSbtPlugin("com.eed3si9n" % "sbt-assembly" % "0.14.7")
addSbtPlugin("org.scoverage" % "sbt-scoverage" % "1.5.1")
addSbtPlugin("org.scalastyle" %% "scalastyle-sbt-plugin" % "1.0.0")
addSbtPlugin("com.gu" % "sbt-riffraff-artifact" % "1.1.8")
addSbtPlugin("org.scalariform" % "sbt-scalariform" % "1.8.2")

addDependencyTreePlugin

val upgradeTransitivePluginDependencies = Seq(
  "com.fasterxml.jackson.core" % "jackson-annotations" % "2.8.11",
  "com.fasterxml.jackson.core" % "jackson-databind" % "2.9.10.8",
  "com.fasterxml.jackson.dataformat" % "jackson-dataformat-cbor" % "2.8.11")
libraryDependencies ++= upgradeTransitivePluginDependencies
