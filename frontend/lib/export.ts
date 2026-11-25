const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function downloadTxt(title: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60) || "transcription"}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// PDF = browser "Save as PDF" from a print view. Unlike jsPDF's built-in fonts this renders
// Devanagari/Tamil correctly because the browser does the text shaping.
export function printPdf(title: string, text: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(
    `<title>${esc(title)}</title><body style="font:16px/1.7 system-ui,sans-serif;white-space:pre-wrap;max-width:700px;margin:40px auto"><h1 style="font-size:22px">${esc(title)}</h1>${esc(text)}</body>`,
  );
  w.document.close();
  w.focus();
  w.print();
  return true;
}
