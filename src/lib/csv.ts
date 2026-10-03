/**
 * CSV generation, aimed squarely at Excel.
 *
 * The file is built in the browser from rows already fetched and handed to the
 * operator as a download. Nothing is written server-side and nothing is kept —
 * an export leaves no trace beyond the file in their Downloads folder.
 */

/**
 * Excel assumes the system's legacy codepage for a .csv unless the file starts
 * with a UTF-8 byte-order mark. Without it, Bengali names and the ৳ sign open as
 * mojibake — the single most common way a "working" export turns out useless.
 */
const BOM = "﻿";

/**
 * CRLF rather than LF: it is what the CSV spec says and what Excel on Windows
 * expects, and it keeps embedded newlines inside quoted fields unambiguous.
 */
const EOL = "\r\n";

/**
 * A value Excel must treat as text, whatever it looks like.
 *
 * Excel infers a type per cell when it opens a .csv and ignores CSV quoting
 * while doing it, so "01711234567" is read as the number 1711234567 — the
 * leading zero is gone and eleven digits render as 1.71E+09. The digits are
 * still in the file, but the person reading the backup cannot see them, which
 * defeats the point of having one.
 */
export interface CsvText {
  readonly __csvText: string;
}

/** Marks a value as "keep this as text in Excel". */
export function asText(value: string | null | undefined): CsvText {
  return { __csvText: value ?? "" };
}

function isCsvText(value: CsvValue): value is CsvText {
  return typeof value === "object" && value !== null && "__csvText" in value;
}

/** What a cell may hold before it is turned into text. */
export type CsvValue = string | number | boolean | null | undefined | CsvText;

/**
 * Characters that make Excel treat a cell as a formula rather than text. A
 * patient named "=cmd|' /c calc'!A0" is far-fetched, but the address field is
 * free text typed at a desk, and a spreadsheet that executes its contents is a
 * real class of bug — so any text cell starting with one of these is prefixed
 * with an apostrophe, which Excel strips on display and never evaluates.
 *
 * Tab and carriage return are included because Excel also honours them as
 * formula leaders in some locales.
 */
const FORMULA_LEADERS = ["=", "+", "-", "@", "\t", "\r"];

function neutralizeFormula(text: string): string {
  return FORMULA_LEADERS.some((c) => text.startsWith(c)) ? `'${text}` : text;
}

/**
 * Renders one value as a CSV field.
 *
 * Numbers and booleans are written bare so Excel keeps them numeric/logical and
 * sorts them properly; only text goes through the formula guard, so a fee of
 * -5 would never be mangled into an apostrophe-prefixed string (and our amounts
 * are never negative in any case).
 */
function toField(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  if (isCsvText(value)) {
    const inner = value.__csvText;
    // An empty cell stays genuinely empty rather than becoming ="".
    if (inner === "") return "";
    // Emitted as ="01711234567". Excel evaluates that to the literal text and
    // never reaches its number parser, so the leading zero and all eleven
    // digits survive. The apostrophe trick ('01711234567) is not used here:
    // Excel honours it when a cell is TYPED, but on opening a .csv it commonly
    // shows the apostrophe as part of the value.
    //
    // This is a formula, which looks at odds with the injection guard below —
    // but it is one this code writes, wrapping a value that is already escaped
    // for quotes, not something a user can inject.
    // Two distinct layers of escaping, applied in order:
    //   1. inside the Excel formula, a literal quote is written as ""
    //   2. inside a CSV field, every quote is then doubled again
    // Collapsing these into one pass works only while the value has no quotes
    // of its own, which is true of phones and timestamps but not of text in
    // general — so do it properly.
    const formula = `="${inner.replace(/"/g, '""')}"`;
    return `"${formula.replace(/"/g, '""')}"`;
  }

  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";

  const text = neutralizeFormula(value);
  // Quote whenever the field could otherwise break the row structure, and
  // double any quote inside it. An address with a comma, a quotation mark or a
  // line break survives a round trip this way.
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Builds a complete CSV document, BOM included, ready to download. */
export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(toField).join(","), ...rows.map((r) => r.map(toField).join(","))];
  // A trailing newline: some tools treat a final line without one as truncated.
  return BOM + lines.join(EOL) + EOL;
}

/**
 * Hands the file to the browser as an ordinary download.
 *
 * The object URL is revoked once the click has been dispatched, so the blob is
 * not held in memory for the life of the tab.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // A timeout rather than an immediate revoke: Safari in particular needs the
  // URL to outlive the click by a tick.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
