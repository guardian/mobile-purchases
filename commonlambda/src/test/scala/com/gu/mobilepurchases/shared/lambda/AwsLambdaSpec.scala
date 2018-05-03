package com.gu.mobilepurchases.shared.lambda

import java.io.{ ByteArrayInputStream, ByteArrayOutputStream }

import com.gu.mobilepurchases.shared.cloudwatch.CloudWatch
import org.apache.logging.log4j.Logger
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.util.Try

class AwsLambdaSpec extends Specification with Mockito {
  "AwsLambda" should {
    "log but not error" in {
      val mockedLogger: Logger = mock[Logger]
      val mockCloudWatch = mock[CloudWatch]
      val testException: IllegalStateException = new IllegalStateException("Throw an error")
      Try(new AwsLambda((_: LambdaRequest) => throw testException, mockedLogger, mockCloudWatch) {}.handleRequest(
        new ByteArrayInputStream("""{"body":"anybody","isBase64Encoded":false,"queryStringParameters":{"Content-Type":"text/plain"}}""".getBytes()),
        new ByteArrayOutputStream(), null)
      ).recover {
        case t => t must beEqualTo(testException)
      }
      there was one(mockedLogger).warn(s"Error executing lambda", testException)

    }
  }

}
