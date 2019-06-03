package com.gu.mobilepurchases.shared.external

import org.apache.logging.log4j.LogManager

import scala.util.{ Failure, Success, Try }

object Logging {

  def logOnThrown[T](function: () => T, messageOnError: String = "", maybeClass: Option[Class[_]] = None): T = Try(function()) match {
    case Success(value) => value
    case Failure(throwable) =>
      LogManager.getLogger(maybeClass.getOrElse(function.getClass)).warn(messageOnError, throwable)
      throw throwable
  }

}
