package com.gu.mobilepurchases.shared.external

import org.apache.logging.log4j.LogManager

import scala.util.{ Failure, Success, Try }

object Logging {

  def logOnThrown[T](function: () => T, messageOnError: String = "", maybeClazz: Option[Class[_]] = None): T = Try(function()) match {
    case Success(value) => value
    case Failure(throwable) =>
      LogManager.getLogger(maybeClazz.getOrElse(function.getClass)).warn(messageOnError, throwable)
      throw throwable
  }

}
