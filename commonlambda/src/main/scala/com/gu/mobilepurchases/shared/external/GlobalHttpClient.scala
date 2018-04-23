package com.gu.mobilepurchases.shared.external

import java.util.concurrent.TimeUnit

import okhttp3.{ ConnectionPool, MediaType, OkHttpClient }

object GlobalOkHttpClient {
  val defaultHttpClient: OkHttpClient = new OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(300, TimeUnit.SECONDS)
    .writeTimeout(300, TimeUnit.SECONDS)
    .connectionPool(new ConnectionPool(50, 5, TimeUnit.MINUTES))
    .build()
  private val applicationJsonContentType: String = "application/json; charset=utf-8"
  val applicationJsonMediaType: MediaType = MediaType.parse(applicationJsonContentType)

}
