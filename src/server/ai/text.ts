import "server-only";

/**
 * Plain text from a PDF or Word (.docx) resume, with resource limits. Parsing runs IN-PROCESS (no sandbox):
 * the limits below bound memory and time for malformed or hostile files but are not process isolation.
 */
export const PARSE_LIMITS = {
  maxBytes: 4 * 1024 * 1024,              // same as the upload limit (MAX_UPLOAD_BYTES)
  docxMaxEntries: 400,                     // files inside the .docx zip
  docxMaxUncompressed: 30 * 1024 * 1024,   // total declared uncompressed size
  docxMaxDocumentXml: 15 * 1024 * 1024,    // word/document.xml uncompressed
  docxMaxRatio: 100,                       // uncompressed / compressed (zip-bomb signal)
  pdfMaxPages: 30,
  maxTextChars: 60_000,
  timeoutMs: 15_000,
} as const;

export class DocumentTextError extends Error {}

const within = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new DocumentTextError("Reading this file took too long.")), ms))]);

/** Checks a .docx zip's declared sizes BEFORE decompressing anything. */
export async function checkDocx(bytes: Buffer): Promise<void> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: false });
  } catch {
    throw new DocumentTextError("This Word file is damaged or not a real .docx.");
  }
  const entries = Object.values(zip.files);
  if (entries.length > PARSE_LIMITS.docxMaxEntries) throw new DocumentTextError("This Word file has too many parts to read safely.");
  let total = 0;
  for (const e of entries) {
    const meta = (e as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    const size = meta?.uncompressedSize ?? 0;
    total += size;
    if (e.name === "word/document.xml" && size > PARSE_LIMITS.docxMaxDocumentXml) throw new DocumentTextError("This Word file is too large to read.");
    if (meta?.compressedSize && size / Math.max(1, meta.compressedSize) > PARSE_LIMITS.docxMaxRatio && size > 1024 * 1024) throw new DocumentTextError("This Word file looks unsafe to read (extreme compression).");
  }
  if (total > PARSE_LIMITS.docxMaxUncompressed) throw new DocumentTextError("This Word file is too large to read.");
  if (!zip.file("word/document.xml")) throw new DocumentTextError("This Word file has no document content.");
}

export async function documentText(bytes: Buffer, mimeType: string): Promise<string> {
  if (bytes.length > PARSE_LIMITS.maxBytes) throw new DocumentTextError("Files must be 4 MB or smaller.");
  let text = "";
  if (mimeType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    text = await within((async () => {
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      if (pdf.numPages > PARSE_LIMITS.pdfMaxPages) throw new DocumentTextError(`Only resumes up to ${PARSE_LIMITS.pdfMaxPages} pages can be read.`);
      const out = await extractText(pdf, { mergePages: false });
      return (Array.isArray(out.text) ? out.text : [out.text]).join("\n");
    })(), PARSE_LIMITS.timeoutMs);
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    await checkDocx(bytes);
    const mammoth = await import("mammoth");
    text = await within(mammoth.extractRawText({ buffer: bytes }).then((r) => r.value), PARSE_LIMITS.timeoutMs);
  } else {
    throw new DocumentTextError("Only PDF and Word (.docx) resumes can be read.");
  }
  text = text.slice(0, PARSE_LIMITS.maxTextChars * 2).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) throw new DocumentTextError("We couldn't read text from this file. Scanned images aren't supported; try a text-based PDF or Word file.");
  return text.slice(0, PARSE_LIMITS.maxTextChars);
}
