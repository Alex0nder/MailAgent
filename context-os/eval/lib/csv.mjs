/** Minimal CSV read/write */
import fs from "node:fs";

export function writeCsv(filePath, rows) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    keys.join(","),
    ...rows.map((row) => keys.map((k) => escape(row[k])).join(",")),
  ];
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

export function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];
  const [headerLine, ...rest] = text.split("\n");
  const headers = parseLine(headerLine);
  return rest.map((line) => {
    const vals = parseLine(line);
    /** @type {Record<string, string>} */
    const row = {};
    headers.forEach((h, i) => {
      row[h] = vals[i] ?? "";
    });
    return row;
  });
}

function parseLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}
