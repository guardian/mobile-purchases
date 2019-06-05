import java.util

import scala.collection.JavaConverters._

val l = List("one, two")

val d = new util.ArrayList[String](l.asJava)