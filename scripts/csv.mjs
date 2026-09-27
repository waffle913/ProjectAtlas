/** RFC 4180-compatible parser supporting quoted commas, escaped quotes and embedded newlines. */
export async function* parseCsvStream(stream) {
  let row = [], field = '', quoted = false, pendingQuote = false, skipLf = false;
  stream.setEncoding?.('utf8');
  for await (const chunk of stream) {
    for (const char of chunk) {
      if (skipLf) { skipLf = false; if (char === '\n') continue; }
      if (quoted) {
        if (pendingQuote) {
          if (char === '"') { field += '"'; pendingQuote = false; continue; }
          quoted = false; pendingQuote = false;
        } else if (char === '"') { pendingQuote = true; continue; }
        else { field += char; continue; }
      }
      if (char === '"' && field === '') { quoted = true; continue; }
      if (char === ',') { row.push(field); field = ''; continue; }
      if (char === '\r' || char === '\n') {
        row.push(field); field = ''; yield row; row = []; if (char === '\r') skipLf = true; continue;
      }
      field += char;
    }
  }
  if (quoted && !pendingQuote) throw new Error('Malformed CSV: unterminated quoted field.');
  if (field.length || row.length) { row.push(field); yield row; }
}

export async function parseCsv(text) {
  async function* chunks() { yield text; }
  const stream = chunks(); const rows = [];
  for await (const row of parseCsvStream(stream)) rows.push(row);
  return rows;
}
