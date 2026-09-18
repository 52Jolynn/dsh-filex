/**
 * Fixture generator for the dsh-filex test suite.
 *
 * Regenerates every binary fixture in this directory. The checked-in fixtures
 * are the source of truth for CI — run this script only when deliberately
 * changing test inputs:
 *
 *   npx tsx tests/fixtures/generate.ts
 *
 * All office/epub/odf fixtures are hand-crafted minimal packages (zip + XML);
 * the two PDFs are built with pdf-lib (+ @napi-rs/canvas for the scanned one).
 */
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";

const OUT = path.dirname(new URL(import.meta.url).pathname);

async function zipSync(files: Record<string, string>): Promise<Uint8Array> {
  const archive = new JSZip();
  for (const [p, content] of Object.entries(files)) {
    archive.file(p, content);
  }
  return archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function zipStoreFirst(first: [string, string], rest: Record<string, string>): Promise<Uint8Array> {
  // ODF requires a stored (uncompressed) `mimetype` as the first entry.
  const archive = new JSZip();
  archive.file(first[0], first[1], { compression: "STORE" });
  for (const [p, content] of Object.entries(rest)) {
    archive.file(p, content);
  }
  return archive.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

// ---------------------------------------------------------------------------
// Office (OOXML) fixtures
// ---------------------------------------------------------------------------

const docx = await zipSync({
  "[Content_Types].xml":
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + "</Types>",
  "_rels/.rels":
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + "</Relationships>",
  "word/document.xml":
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>dsh-filex 文档标题</w:t></w:r></w:p>'
    + "<w:p><w:r><w:t>这是第一段正文内容。</w:t></w:r></w:p>"
    + "</w:body></w:document>",
});

const xlsx = await zipSync({
  "[Content_Types].xml":
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    + "</Types>",
  "_rels/.rels":
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + "</Relationships>",
  "xl/workbook.xml":
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="数据表" sheetId="1" r:id="rId1"/></sheets></workbook>',
  "xl/_rels/workbook.xml.rels":
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    + "</Relationships>",
  "xl/worksheets/sheet1.xml":
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + '<row r="1"><c r="A1" t="inlineStr"><is><t>项目名称</t></is></c><c r="B1" t="inlineStr"><is><t>进度</t></is></c></row>'
    + '<row r="2"><c r="A2" t="inlineStr"><is><t>dsh-filex</t></is></c><c r="B2"><v>80</v></c></row>'
    + "</sheetData></worksheet>",
});

const pptx = await zipSync({
  "[Content_Types].xml":
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
    + '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
    + "</Types>",
  "_rels/.rels":
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>'
    + "</Relationships>",
  "ppt/presentation.xml":
    '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>',
  "ppt/_rels/presentation.xml.rels":
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>'
    + "</Relationships>",
  "ppt/slides/slide1.xml":
    '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    + "<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/></p:nvGrpSpPr><p:grpSpPr/>"
    + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>'
    + "<p:txBody><a:bodyPr/><a:p><a:r><a:t>dsh-filex 架构评审</a:t></a:r></a:p></p:txBody></p:sp>"
    + '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/>'
    + "<p:txBody><a:bodyPr/><a:p><a:r><a:t>支持 docx/pdf/epub 等格式提取</a:t></a:r></a:p></p:txBody></p:sp>"
    + "</p:spTree></p:cSld></p:sld>",
});

// ---------------------------------------------------------------------------
// EPUB fixture (standard structure: <package> root — regression for the
// parseContentOpf top-level-only bug)
// ---------------------------------------------------------------------------

const epub = await zipSync({
  mimetype: "application/epub+zip",
  "META-INF/container.xml":
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
    + '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  "OEBPS/content.opf":
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">'
    + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>插件开发手记</dc:title><dc:creator>测试</dc:creator>'
    + '<dc:identifier id="uid">urn:uuid:1234</dc:identifier><dc:language>zh</dc:language></metadata>'
    + '<manifest><item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>'
    + '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest>'
    + "<spine><itemref idref=\"c1\"/></spine></package>",
  "OEBPS/nav.xhtml":
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">'
    + '<head><title>nav</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">第一章</a></li></ol></nav></body></html>',
  "OEBPS/chapter1.xhtml":
    '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>c1</title></head>'
    + "<body><h1>第一章 工具设计</h1><p>dsh-filex 通过 WASM 提取文档内容。</p></body></html>",
});

// ---------------------------------------------------------------------------
// ODF fixtures (stored first `mimetype` entry; regression for the
// readOdt/readOdtContent mixup and the 0-based sheet coordinate bug)
// ---------------------------------------------------------------------------

async function odf(mimetype: string, contentXml: string): Promise<Uint8Array> {
  const manifest =
    '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'
    + `<manifest:file-entry manifest:full-path="/" manifest:media-type="${mimetype}"/>`
    + '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>';
  return zipStoreFirst(["mimetype", mimetype], {
    "META-INF/manifest.xml": manifest,
    "content.xml": contentXml,
  });
}

const odt = await odf(
  "application/vnd.oasis.opendocument.text",
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
  + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">'
  + "<office:body><office:text>"
  + '<text:h text:outline-level="1">ODF 提取验证</text:h>'
  + "<text:p>这是一段用于验证 odt 提取的正文。</text:p>"
  + "</office:text></office:body></office:document-content>",
);

// Regression for the emitSheetTable 0-based coordinate fix: content starts at
// A1 (row 0, column 0) — the old 1-based loop dropped it entirely.
const ods = await odf(
  "application/vnd.oasis.opendocument.spreadsheet",
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
  + 'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
  + 'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">'
  + "<office:body><office:spreadsheet><table:table table:name=\"Sheet1\">"
  + '<table:table-row><table:table-cell office:value-type="string"><text:p>科目</text:p></table:table-cell>'
  + '<table:table-cell office:value-type="float" office:value="42"><text:p>42</text:p></table:table-cell></table:table-row>'
  + "</table:table></office:spreadsheet></office:body></office:document-content>",
);

// ---------------------------------------------------------------------------
// PDF fixtures
// ---------------------------------------------------------------------------

async function textPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  page.drawText("Hello dsh-filex text layer", { x: 72, y: 700, size: 18, font });
  return pdf.save();
}

async function scannedPdf(): Promise<Uint8Array> {
  // "Scanned" page: text rendered into a raster image, so the PDF itself has
  // no text layer and classification must return Scanned.
  const canvas = createCanvas(1240, 1754);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1240, 1754);
  ctx.fillStyle = "#000";
  ctx.font = "48px sans-serif";
  ctx.fillText("Scanned fixture page", 100, 200);
  const jpg = canvas.toBuffer("image/jpeg", 0.9);

  const pdf = await PDFDocument.create();
  const img = await pdf.embedJpg(jpg);
  const page = pdf.addPage([595, 842]);
  page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  return pdf.save();
}

// ---------------------------------------------------------------------------

const outputs: [string, Uint8Array][] = [
  ["sample.docx", docx],
  ["sample.xlsx", xlsx],
  ["sample.pptx", pptx],
  ["sample.epub", epub],
  ["sample.odt", odt],
  ["sample.ods", ods],
  ["text.pdf", await textPdf()],
  ["scanned.pdf", await scannedPdf()],
];

for (const [name, bytes] of outputs) {
  await writeFile(path.join(OUT, name), bytes);
  console.log(`wrote ${name} (${bytes.length} bytes)`);
}
