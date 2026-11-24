/**
 * Minimal RFC 4180 CSV parser for admin imports (quoted fields, escaped quotes, CRLF). The header row names the
 * fields; a "skills" column is split on ";". Output goes through the same import validation as JSON.
 */
export function parseCsv(text: string, maxRows = 500): Record<string, unknown>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else field += ch;
  }
  if (quoted) throw new Error("Unclosed quote in CSV");
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head?.length) throw new Error("CSV needs a header row");
  const keys = head.map((h) => h.trim());
  if (!keys.includes("title") || !keys.includes("organization")) throw new Error("CSV header must include title and organization");
  return body.slice(0, maxRows).map((cells) => {
    const o: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      const v = (cells[i] ?? "").trim();
      if (!v || !/^[A-Za-z]{1,30}$/.test(k)) return;
      o[k] = k === "skills" ? v.split(";").map((x) => x.trim()).filter(Boolean) : v;
    });
    return o;
  });
}
