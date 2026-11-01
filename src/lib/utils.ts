import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Quote a value for use inside a PostgREST `.or()` filter string.
 * Without quoting, user input containing commas or parentheses
 * (e.g. "Porsche (GT3)") breaks the filter and the query errors out.
 */
export function pgQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
