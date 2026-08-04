/** Fetch com cabeçalhos de navegador — alguns sites oficiais bloqueiam UA padrão. */
export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

export function httpFetch(url: string, timeoutMs = 60_000): Promise<Response> {
  return fetch(url, {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
}
