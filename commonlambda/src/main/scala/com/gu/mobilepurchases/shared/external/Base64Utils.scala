package com.gu.mobilepurchases.shared.external

import java.util.Base64

object Base64Utils {
  val decoder: Base64.Decoder = Base64.getDecoder
  val encoder: Base64.Encoder = Base64.getEncoder
  val IsBase64Encoded:Boolean = true
  val IsNotBase64Encoded:Boolean = false
}
