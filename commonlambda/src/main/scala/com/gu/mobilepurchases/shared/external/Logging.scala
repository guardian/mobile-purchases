package com.gu.mobilepurchases.shared.external

import org.apache.logging.log4j.LogManager

object Logging {

  def logOnThrown[T](function: () => T, messageOnError:String = "", maybeClazz: Option[Class[_]] = None):T  = {
    try {
      function()
    }
    catch {
      case t:Throwable => {
        LogManager.getLogger(maybeClazz.getOrElse(function.getClass)).warn(messageOnError, t)
        throw t
      }
    }
  }
}
