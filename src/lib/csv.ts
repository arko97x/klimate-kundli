export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const rows = parseCsvRecords(text).filter((row) => row.some((cell) => cell.trim() !== ""));
  const headerIndex = rows.findIndex((row) => row.length > 1 && !row[0]?.trim().startsWith("#"));

  if (headerIndex === -1) {
    return [];
  }

  const headers = rows[headerIndex].map((header) => header.trim());

  return rows.slice(headerIndex + 1).map((row) => {
    const out: CsvRow = {};
    headers.forEach((header, index) => {
      out[header] = row[index]?.trim() ?? "";
    });
    return out;
  });
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  return [
    headers.join(","),
    ...rows.map((row) => row.map((value) => escapeCsv(String(value))).join(",")),
    "",
  ].join("\n");
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      record.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}

function escapeCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '""')}"`;
}
