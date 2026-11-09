import "server-only";

/** Plain text from a PDF or Word (.docx) resume. Throws a readable error for scanned or unreadable files. */
export async function documentText(bytes: Buffer, mimeType: string): Promise<string> {
  let text = "";
  if (mimeType === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const out = await extractText(pdf, { mergePages: false });
    text = (Array.isArray(out.text) ? out.text : [out.text]).join("\n");
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ buffer: bytes })).value;
  } else {
    throw new Error("Only PDF and Word (.docx) resumes can be read.");
  }
  text = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 40) throw new Error("We couldn't read text from this file. Scanned images aren't supported; try a text-based PDF or Word file.");
  return text.slice(0, 60_000);
}
