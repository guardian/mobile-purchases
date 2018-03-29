import sbt.File
import sbtassembly.MergeStrategy

class FromJarStrategy(jar: String) extends MergeStrategy {
  override def name: String = "fromJar"

  override def apply(tempDir: File, path: String, files: Seq[File]): Either[String, Seq[(File, String)]] = Right(files.filter(sbtassembly.AssemblyUtils.sourceOfFileForMerge(tempDir, _) match {
        case (source, _, _, true) => source.getName == jar
        case _ => false
      }
  ).map(_ -> path))
}