// CORS mínimo: solo el origen de la PWA (GitHub Pages) puede llamar a la API.
export function corsHeaders(origin: string | undefined, allowed: string[]): Record<string, string> | null {
  if (!origin || !allowed.includes(origin)) return null
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  }
}

// ALLOWED_ORIGINS: lista separada por comas, p. ej. https://certificados.marcialql.es
export function allowedOriginsFrom(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
