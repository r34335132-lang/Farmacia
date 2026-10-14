type ProductsPage<T> = {
  products?: T[]
  total?: number | null
  error?: string
}

const PAGE_SIZE = 1000
const CONCURRENCY = 4

async function fetchPage<T>(page: number, pageSize: number, branchId?: string | null): Promise<ProductsPage<T>> {
  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
  if (branchId) params.set("branch_id", branchId)
  const res = await fetch(`/api/products?${params}`, { cache: "no-store" })
  const json = (await res.json().catch(() => ({}))) as ProductsPage<T>
  if (!res.ok) throw new Error(json.error || `Error al cargar productos (página ${page + 1})`)
  return json
}

/**
 * Descarga el catálogo completo en bloques de 1000 (varios en paralelo), sin límite de filas.
 * Si Supabase tiene "Max rows" menor a 1000, se adapta al tamaño que devuelva.
 */
export async function fetchAllProducts<T extends { id: string }>(branchId?: string | null): Promise<T[]> {
  const first = await fetchPage<T>(0, PAGE_SIZE, branchId)
  const firstRows = first.products || []
  const total = typeof first.total === "number" ? first.total : null

  if (firstRows.length === 0 || (total !== null && firstRows.length >= total)) return firstRows
  if (total === null && firstRows.length < PAGE_SIZE) return firstRows

  const pageSize = firstRows.length
  const pages: T[][] = [firstRows]

  if (total !== null) {
    const pageCount = Math.ceil(total / pageSize)
    let next = 1
    const worker = async () => {
      while (next < pageCount) {
        const page = next++
        const json = await fetchPage<T>(page, pageSize, branchId)
        pages[page] = json.products || []
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pageCount - 1) }, worker))
  }

  // Por si se agregaron productos mientras se descargaba, sigue hasta una página incompleta.
  let page = pages.length
  while ((pages[pages.length - 1]?.length || 0) === pageSize) {
    const rows = (await fetchPage<T>(page, pageSize, branchId)).products || []
    pages[page++] = rows
    if (rows.length === 0) break
  }

  const seen = new Set<string>()
  const all: T[] = []
  for (const rows of pages) {
    for (const row of rows || []) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      all.push(row)
    }
  }
  return all
}
