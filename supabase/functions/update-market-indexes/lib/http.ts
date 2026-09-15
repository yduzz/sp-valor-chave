/** Fetch com cabeçalhos de navegador — alguns sites oficiais bloqueiam UA padrão. */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

/** Espelho público gratuito, usado apenas quando a origem bloqueia o servidor. */
export const MIRROR = (url: string) => `https://r.jina.ai/${url}`;

export function httpFetch(url: string, timeoutMs = 60_000): Promise<Response> {
  return fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Busca conteúdo com tolerância a bloqueio geográfico/WAF:
 * tenta a origem e, em caso de falha, recorre ao espelho público.
 */
export async function fetchWithMirror(
  url: string,
  timeoutMs = 60_000,
): Promise<{ bytes: Uint8Array; viaMirror: boolean } | null> {
  try {
    const direct = await httpFetch(url, timeoutMs);
    if (direct.ok) {
      const bytes = new Uint8Array(await direct.arrayBuffer());
      if (bytes.byteLength > 512) return { bytes, viaMirror: false };
    }
  } catch (_) { /* segue para o espelho */ }

  try {
    const mirrored = await httpFetch(MIRROR(url), timeoutMs);
    if (mirrored.ok) {
      const bytes = new Uint8Array(await mirrored.arrayBuffer());
      if (bytes.byteLength > 200) return { bytes, viaMirror: true };
    }
  } catch (_) { /* indisponível */ }

  return null;
}

export async function fetchTextWithMirror(url: string, timeoutMs = 60_000): Promise<string> {
  const res = await fetchWithMirror(url, timeoutMs);
  if (!res) throw new Error(`Fonte indisponível: ${url}`);
  return new TextDecoder("utf-8").decode(res.bytes);
}

/** Verifica se o conteúdo baixado é realmente um PDF. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
