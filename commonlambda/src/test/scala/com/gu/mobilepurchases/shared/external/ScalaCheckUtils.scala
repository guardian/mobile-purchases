package com.gu.mobilepurchases.shared.external

import java.time.{ ZoneOffset, ZonedDateTime }

import com.gu.mobilepurchases.shared.external.ScalaCheckUtils.genCommonAscii
import org.scalacheck.Gen.{ listOf, oneOf }
import org.scalacheck.{ Arbitrary, Gen }
import org.specs2.ScalaCheck
import org.specs2.mutable.Specification

object ScalaCheckUtils {
  val commonAsciiChars: List[Char] = ((32 until 126).toList :+ 12).map((_: Int).toChar)
  val genCommonAscii: Gen[String] = genStringFromChars(commonAsciiChars)
  private val epoch1980 = ZonedDateTime.of(1980, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC).toEpochSecond
  private val nowPlusOneYear = ZonedDateTime.now().plusYears(1).toEpochSecond
  val genReasonableEpoch = Gen.choose(epoch1980, nowPlusOneYear)
  def genStringFromChars(chars: Seq[Char]): Gen[String] = listOf(oneOf[Char](chars)).map((_: List[Char]).mkString)

}

class ScalaCheckSpec extends Specification with ScalaCheck {
  "ScalaCheckSpec" should {

    "should gen expected chars" >> {
      prop { (string: String) =>
        {
          string must beAnInstanceOf[String]
        }
      }.setArbitrary(Arbitrary(genCommonAscii))
    }

  }

}