package com.gu.mobilepurchases.shared.external

import com.fasterxml.jackson.databind.{ DeserializationFeature, ObjectMapper }
import com.fasterxml.jackson.module.scala.DefaultScalaModule
import com.fasterxml.jackson.module.scala.ClassTagExtensions

object Jackson {
  val mapper: ObjectMapper with ClassTagExtensions = {
    val mapper = new ObjectMapper with ClassTagExtensions
    mapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
    mapper.registerModule(DefaultScalaModule)
    mapper
  }

}
