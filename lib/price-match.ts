const STOPWORDS = new Set(["de", "del", "con", "y", "la", "el", "los", "las", "en", "para", "x", "c", "in", "a"])

const ALIASES: Record<string, string> = {
  gr: "g",
  grs: "g",
  gramos: "g",
  caps: "cap",
  capsula: "cap",
  capsulas: "cap",
  tabs: "tab",
  tableta: "tab",
  tabletas: "tab",
  comprimidos: "tab",
  suspencion: "suspension",
  susp: "suspension",
  sol: "solucion",
  iny: "inyectable",
  pediatrico: "pediatrica",
  infantil: "pediatrica",
}

const UNITS = new Set(["mg", "ml", "g", "mcg", "ui", "cap", "tab", "pza", "pzas"])

export type MatchToken = { text: string; numeric: boolean; weight: number }

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/(\d)\s*(mg|ml|mcg|grs|gr|g|ui|caps|cap|tabs|tab)\b/g, "$1 $2")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s\.|\.\s|^\.|\.$/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function tokenize(value: string): MatchToken[] {
  const tokens: MatchToken[] = []
  for (const raw of normalizeText(value).split(" ")) {
    if (!raw) continue
    const text = ALIASES[raw] || raw
    if (STOPWORDS.has(text)) continue
    const numeric = /^\d+(\.\d+)?$/.test(text)
    const normalizedNumber = numeric ? String(Number(text)) : text
    tokens.push({ text: normalizedNumber, numeric, weight: UNITS.has(text) ? 0.4 : numeric ? 1.2 : 1 })
  }
  return tokens
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = curr
  }
  return prev[b.length]
}

export function tokenSimilarity(a: MatchToken, b: MatchToken): number {
  if (a.text === b.text) return 1
  if (a.numeric || b.numeric) return 0
  const shorter = a.text.length <= b.text.length ? a.text : b.text
  const longer = shorter === a.text ? b.text : a.text
  if (shorter.length >= 4 && longer.startsWith(shorter)) return 0.85
  if (shorter.length < 4) return 0
  const sim = 1 - levenshtein(a.text, b.text) / longer.length
  return sim >= 0.7 ? sim : 0
}

export type Matchable = { id: string; name: string; price: number }

export type MatchCandidate<T> = { product: T; score: number }

/**
 * Compara cada renglón de la lista contra el catálogo y regresa los mejores candidatos.
 * Usa similitud por palabra (tolera faltas de ortografía) y exige que coincidan las cantidades (mg, ml…).
 */
export function rankCandidates<T extends Matchable>(
  lines: { name: string }[],
  products: T[],
  limit = 6,
): MatchCandidate<T>[][] {
  const productTokens = products.map((p) => tokenize(p.name))
  const vocabulary = new Map<string, MatchToken>()
  for (const tokens of productTokens) for (const t of tokens) vocabulary.set(t.text, t)

  const simCache = new Map<string, Map<string, number>>()
  const similarTo = (token: MatchToken) => {
    let map = simCache.get(token.text)
    if (!map) {
      map = new Map()
      for (const candidate of vocabulary.values()) {
        const sim = tokenSimilarity(token, candidate)
        if (sim > 0) map.set(candidate.text, sim)
      }
      simCache.set(token.text, map)
    }
    return map
  }

  return lines.map((line) => {
    const lineTokens = tokenize(line.name)
    if (lineTokens.length === 0) return []
    const lineSims = lineTokens.map(similarTo)
    const lineWeight = lineTokens.reduce((s, t) => s + t.weight, 0)
    const lineNumbers = lineTokens.filter((t) => t.numeric).map((t) => t.text)
    const firstWordIndex = lineTokens.findIndex((t) => !t.numeric)

    const scored: MatchCandidate<T>[] = []
    products.forEach((product, idx) => {
      const tokens = productTokens[idx]
      if (tokens.length === 0) return

      let recall = 0
      let firstWordSim = 0
      lineTokens.forEach((lt, i) => {
        let best = 0
        for (const pt of tokens) {
          const sim = lineSims[i].get(pt.text) || 0
          if (sim > best) best = sim
          if (best === 1) break
        }
        recall += best * lt.weight
        if (i === firstWordIndex) firstWordSim = best
      })
      recall /= lineWeight
      if (recall < 0.3) return

      let matchedProductWeight = 0
      let productWeight = 0
      for (const pt of tokens) {
        productWeight += pt.weight
        if (lineSims.some((m) => (m.get(pt.text) || 0) > 0)) matchedProductWeight += pt.weight
      }
      const precision = productWeight ? matchedProductWeight / productWeight : 0

      let score = 0.75 * recall + 0.25 * precision
      if (firstWordIndex >= 0 && firstWordSim < 0.7) score *= 0.5
      if (lineNumbers.length > 0) {
        const productNumbers = tokens.filter((t) => t.numeric).map((t) => t.text)
        if (productNumbers.length > 0 && !lineNumbers.some((n) => productNumbers.includes(n))) score *= 0.6
      }
      if (score >= 0.35) scored.push({ product, score })
    })

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit)
  })
}

/**
 * Asigna a cada renglón un producto distinto (un producto no se usa dos veces).
 * Ante empate de parecido, prefiere el producto cuyo precio actual está más cerca del de la lista.
 */
export function assignBestMatches<T extends Matchable>(
  lines: { price: number }[],
  candidates: MatchCandidate<T>[][],
  minScore = 0.55,
): (MatchCandidate<T> | null)[] {
  const pairs: { line: number; candidate: MatchCandidate<T>; priceGap: number }[] = []
  candidates.forEach((list, line) => {
    for (const candidate of list) {
      if (candidate.score < minScore) continue
      pairs.push({ line, candidate, priceGap: Math.abs(Number(candidate.product.price) - lines[line].price) })
    }
  })
  pairs.sort((a, b) => {
    const diff = b.candidate.score - a.candidate.score
    if (Math.abs(diff) > 0.02) return diff
    return a.priceGap - b.priceGap
  })

  const result: (MatchCandidate<T> | null)[] = lines.map(() => null)
  const used = new Set<string>()
  for (const pair of pairs) {
    if (result[pair.line] || used.has(pair.candidate.product.id)) continue
    result[pair.line] = pair.candidate
    used.add(pair.candidate.product.id)
  }
  return result
}

/** Interpreta renglones pegados tipo "Paracetamol 500mg ------ $10.00". */
export function parsePriceLines(text: string): { name: string; price: number }[] {
  const out: { name: string; price: number }[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const match = line.match(/^(.*?)[\s\-–—_.:|\t]*\$?\s*(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:mxn|pesos)?\s*$/i)
    if (!match) continue
    const name = match[1].replace(/[\s\-–—_.:|$]+$/g, "").trim()
    const price = Number(match[2].replace(",", "."))
    if (name && Number.isFinite(price) && price > 0) out.push({ name, price })
  }
  return out
}
