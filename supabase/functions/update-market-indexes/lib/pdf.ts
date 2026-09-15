/**
 * Extração de texto de PDF. Usa `unpdf` (Deno-compatível).
 * Se o PDF for escaneado (sem camada de texto), retorna string vazia e o
 * orquestrador registra o log sem interromper a execução.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("npm:unpdf@0.12.1");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return typeof text === "string" ? text : (text as string[]).join("\n");
  } catch (_) {
    return "";
  }
}
