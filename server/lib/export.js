'use strict';
// Report exporters with zero dependencies: CSV, real .xlsx (OOXML in a ZIP) and PDF.
const zlib = require('node:zlib');

// columns: [{ key, label, width }]  rows: array of objects
function csv(columns, rows) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;           // neutralise spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(','))].join('\r\n');
}

// ---------------- XLSX ----------------
function zip(files) { // files: [{ name, data:Buffer }]
  const locals = []; const centrals = []; let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name); const comp = zlib.deflateRawSync(f.data); const crc = zlib.crc32(f.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function xlsx(sheetName, columns, rows, title) {
  const hasTitle = !!title; const headerRow = hasTitle ? 3 : 1;
  let sheetRows = '';
  if (hasTitle) sheetRows += `<row r="1"><c r="A1" s="3" t="inlineStr"><is><t>${xml(title)}</t></is></c></row>`;
  sheetRows += `<row r="${headerRow}">` + columns.map((c, i) => `<c r="${colName(i)}${headerRow}" s="1" t="inlineStr"><is><t>${xml(c.label)}</t></is></c>`).join('') + '</row>';
  rows.forEach((r, ri) => {
    const n = headerRow + 1 + ri;
    sheetRows += `<row r="${n}">` + columns.map((c, i) => {
      const v = r[c.key]; const ref = `${colName(i)}${n}`;
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="2"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
    }).join('') + '</row>';
  });
  const cols = columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 16}" customWidth="1"/>`).join('');
  const f = (n, s) => ({ name: n, data: Buffer.from(s, 'utf8') });
  return zip([
    f('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    f('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    f('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    f('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    f('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="0" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    f('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${'<pane ySplit="' + headerRow + '" topLeftCell="A' + (headerRow + 1) + '" activePane="bottomLeft" state="frozen"/>'}</sheetView></sheetViews><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`),
  ]);
}

// ---------------- PDF ----------------
function pdf(title, subtitle, columns, rows) {
  const W = 842, H = 595, M = 36, ROW = 17, FS = 8.5;
  const totalW = columns.reduce((s, c) => s + (c.width || 16), 0);
  const scale = (W - 2 * M) / totalW;
  const widths = columns.map((c) => (c.width || 16) * scale);
  const clean = (s) => String(s ?? '').replace(/[^\x20-\x7E -ÿ]/g, '?');
  const pdfStr = (s) => '(' + clean(s).replace(/([\\()])/g, '\\$1') + ')';
  const fit = (s, w) => { s = clean(s); const max = Math.max(1, Math.floor((w - 8) / (FS * 0.52))); return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '.' : s; };

  const perFirst = Math.floor((H - M - 92 - M) / ROW); const perOther = Math.floor((H - 2 * M - 30) / ROW);
  const pages = []; let i = 0;
  do { const n = pages.length === 0 ? perFirst : perOther; pages.push(rows.slice(i, i + n)); i += n; } while (i < rows.length);

  const streams = pages.map((chunk, pi) => {
    let c = ''; let y = H - M;
    if (pi === 0) {
      c += `0.145 0.388 0.922 rg ${M} ${H - M - 8} ${W - 2 * M} 3 re f\n`;
      c += `BT /F2 18 Tf 0.114 0.306 0.847 rg ${M} ${H - M - 34} Td ${pdfStr(title)} Tj ET\n`;
      c += `BT /F1 9 Tf 0.4 0.45 0.52 rg ${M} ${H - M - 52} Td ${pdfStr(subtitle)} Tj ET\n`;
      y = H - M - 70;
    } else y = H - M - 8;
    // header
    let x = M;
    c += `0.145 0.388 0.922 rg ${M} ${y - ROW + 4} ${W - 2 * M} ${ROW} re f\n`;
    columns.forEach((col, k) => { c += `BT /F2 ${FS} Tf 1 1 1 rg ${x + 4} ${y - ROW + 9} Td ${pdfStr(fit(col.label, widths[k]))} Tj ET\n`; x += widths[k]; });
    y -= ROW;
    chunk.forEach((r, ri) => {
      if (ri % 2 === 1) c += `0.94 0.96 0.98 rg ${M} ${y - ROW + 4} ${W - 2 * M} ${ROW} re f\n`;
      x = M;
      columns.forEach((col, k) => { c += `BT /F1 ${FS} Tf 0.1 0.13 0.2 rg ${x + 4} ${y - ROW + 9} Td ${pdfStr(fit(r[col.key], widths[k]))} Tj ET\n`; x += widths[k]; });
      y -= ROW;
    });
    if (!rows.length) c += `BT /F1 10 Tf 0.4 0.45 0.52 rg ${M} ${y - 20} Td (No records found for the selected filters.) Tj ET\n`;
    c += `BT /F1 8 Tf 0.5 0.55 0.6 rg ${M} 20 Td ${pdfStr(`SmartAttend AI  |  Generated ${new Date().toLocaleString('en-GB')}`)} Tj ET\n`;
    c += `BT /F1 8 Tf 0.5 0.55 0.6 rg ${W - M - 50} 20 Td ${pdfStr(`Page ${pi + 1} of ${pages.length}`)} Tj ET\n`;
    return c;
  });

  // objects: 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page obj + content obj
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  const kids = [];
  streams.forEach((s, k) => {
    const pageNo = 5 + k * 2; const contentNo = pageNo + 1; kids.push(`${pageNo} 0 R`);
    objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNo} 0 R >>`;
    objs[contentNo] = { stream: s };
  });
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offsets = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = Buffer.byteLength(out, 'latin1');
    const o = objs[n];
    out += typeof o === 'string' ? `${n} 0 obj\n${o}\nendobj\n` : `${n} 0 obj\n<< /Length ${Buffer.byteLength(o.stream, 'latin1')} >>\nstream\n${o.stream}endstream\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

module.exports = { csv, xlsx, pdf };
