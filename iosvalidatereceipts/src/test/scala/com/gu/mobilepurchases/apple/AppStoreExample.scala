package com.gu.mobilepurchases.apple

import com.gu.mobilepurchases.shared.external.Jackson

import scala.io.Source


object AppStoreExample {
  val success: AppStoreExample = new AppStoreExample("success-prod")

  def successAsAppStoreResponse: AppStoreResponse = Jackson.mapper.readValue(success.responseString, classOf[AppStoreResponse])
}

class AppStoreExample(folderName: String) {
  def responseString: String = Source.fromResource(s"apple/example/$folderName/response.json").mkString
}
