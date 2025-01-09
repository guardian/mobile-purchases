import { Option } from "./option";

export function optionalMsToDate(ms: Option<string> | undefined): Option<Date> {
  if (ms) {
    const parsedDate = new Date(Number.parseInt(ms));
    if (!isNaN(parsedDate.getDate())) {
      return parsedDate;
    } else {
      return null;
    }
  } else {
    return null;
  }
}

export function thirtyMonths(from: Date = new Date()): Date {
  return plusMonths(from, 30);
}

export function dateToSecondTimestamp(date: Date): number {
  return Math.ceil(date.getTime() / 1000);
}

export function plusMonths(from: Date, count: number): Date {
  const newDate = new Date(from.getTime());
  newDate.setUTCMonth(from.getUTCMonth() + count);
  return newDate;
}

export function plusDays(from: Date, count: number): Date {
  const newDate = new Date(from.getTime());
  newDate.setUTCDate(from.getUTCDate() + count);
  return newDate;
}

export function plusHours(from: Date, count: number): Date {
  const newDate = new Date(from.getTime());
  newDate.setUTCHours(from.getUTCHours() + count);
  return newDate;
}
