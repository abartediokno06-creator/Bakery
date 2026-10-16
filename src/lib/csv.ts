type Cell = string | number | null | undefined;

/** Quote for CSV and stop spreadsheets from running typed-in text as a formula. */
function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads rows (first row = headers) as a CSV that Excel opens with the right encoding. */
export function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<Cell>>): void {
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
