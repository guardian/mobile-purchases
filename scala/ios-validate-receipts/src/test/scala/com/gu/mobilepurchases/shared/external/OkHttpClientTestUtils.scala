package com.gu.mobilepurchases.shared.external

import okhttp3.{ Headers, MediaType, Protocol, Request, Response, ResponseBody }

import scala.collection.JavaConverters._

object OkHttpClientTestUtils {
  def testOkHttpResponse(request: Request, code: Int, maybeMediaType: Option[MediaType], maybeBody: Option[Array[Byte]], headers: Map[String, String]): Response = {
    maybeBody.map(b => ResponseBody.create(maybeMediaType.orNull, b)).map(new Response.Builder().body(_)).getOrElse(new Response.Builder())
      .code(code)
      .protocol(Protocol.HTTP_2)
      .request(request)
      .message("status message")
      .headers(Headers.of(headers.asJava))
      .build()
  }

}
