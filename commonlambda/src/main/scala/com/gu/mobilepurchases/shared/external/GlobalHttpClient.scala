package com.gu.mobilepurchases.shared.external

import java.util.concurrent.TimeUnit

import okhttp3.{ ConnectionPool, MediaType, OkHttpClient }

object GlobalOkHttpClient {
  val defaultHttpClient: OkHttpClient = new OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .writeTimeout(20, TimeUnit.SECONDS)
    .connectionPool(new ConnectionPool(30, 30, TimeUnit.MINUTES))
    .build()
  private val applicationJsonContentType: String = "application/json; charset=utf-8"
  val applicationJsonMediaType: MediaType = MediaType.parse(applicationJsonContentType)
}
