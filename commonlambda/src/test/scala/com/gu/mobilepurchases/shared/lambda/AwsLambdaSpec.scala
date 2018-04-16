package com.gu.mobilepurchases.shared.lambda

import java.io.{ByteArrayInputStream, ByteArrayOutputStream}

import org.apache.logging.log4j.Logger
import org.specs2.mock.Mockito
import org.specs2.mutable.Specification

import scala.util.Try

class AwsLambdaSpec extends Specification with Mockito {
  "AwsLambda" should {
    "log but not error" in {
      val mockedLogger:Logger = mock[Logger]
      val testException:IllegalStateException = new IllegalStateException("Throw an error")
      Try(new AwsLambda((_:LambdaRequest) => throw testException, mockedLogger) {}.handleRequest(
        new ByteArrayInputStream("""{"body":"dGVzdEJhc2U2NGlucHV0","isBase64Encoded":true,"queryStringParameters":{"Content-Type":"text/plain"}}""".getBytes()),
        new ByteArrayOutputStream(), null)
      ).recover {
        case t => t must beEqualTo(testException)
      }
      there was one(mockedLogger).warn(s"Error executing lambda", testException)

    }
  }

}
