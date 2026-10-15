"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Eye,
  ListChecks,
  Loader2,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Search,
  SearchX,
  Store,
  Tags,
  Trash2,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CountUp, stagger } from "@/components/motion"
import { fetchAllProducts } from "@/lib/fetch-all-products"
import { formatMoney } from "@/lib/money"
import { assignBestMatches, normalizeText, parsePriceLines, rankCandidates } from "@/lib/price-match"
import { OJITOS_CAMELLON_BRANCH_ID, OJITOS_CAMELLON_PRICE_LIST, type PriceListItem } from "@/lib/price-lists/ojitos-camellon"
import { cn } from "@/lib/utils"

type Line = PriceListItem & { key: string }

type BranchProduct = {
  id: string
  name: string
  price: number
  barcode?: string | null
  section?: string | null
  stock_quantity?: number
  is_active?: boolean
}

type Choice = { kind: "product"; id: string } | { kind: "new" } | { kind: "none" }

type Status = "ok" | "diff" | "missing" | "new"

type Filter = "all" | "diff" | "ok" | "missing" | "review"

type ApplyResult = {
  updated: number
  unchanged: number
  created: number
  failed: { name: string; error: string }[]
}

let lineSeq = 0
const toLines = (items: { name: string; price: number; verify?: boolean }[]): Line[] =>
  items.map((item) => ({ ...item, key: `l${++lineSeq}` }))

export default function PriceListReviewPage() {
  const router = useRouter()
  const supabase = createClient()

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState(OJITOS_CAMELLON_BRANCH_ID)
  const [lines, setLines] = useState<Line[]>(() => toLines(OJITOS_CAMELLON_PRICE_LIST))
  const [products, setProducts] = useState<BranchProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const [newPrices, setNewPrices] = useState<Record<string, string>>({})
  const [createNames, setCreateNames] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>("all")
  const [search, setSearch] = useState("")
  const [pasteText, setPasteText] = useState("")
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState("")
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<ApplyResult | null>(null)

  useEffect(() => {
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }
      const res = await fetch("/api/branches")
      if (res.ok) {
        const json = await res.json()
        setBranches(json.branches || [])
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProducts = async (id = branchId) => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await fetchAllProducts<BranchProduct>(id)
      setProducts(
        data
          .filter((p) => p.is_active !== false)
          .map((p) => ({ ...p, price: Number(p.price) || 0 })),
      )
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los productos")
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!branchId) return
    setChoices({})
    setExcluded(new Set())
    setResult(null)
    loadProducts(branchId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const candidates = useMemo(() => rankCandidates(lines, products), [lines, products])

  const autoMatches = useMemo(() => {
    const manualIds = new Set(
      Object.values(choices)
        .filter((c): c is { kind: "product"; id: string } => c.kind === "product")
        .map((c) => c.id),
    )
    const forAuto = candidates.map((list, i) =>
      choices[lines[i].key] ? [] : list.filter((c) => !manualIds.has(c.product.id)),
    )
    return assignBestMatches(lines, forAuto)
  }, [candidates, choices, lines])

  const rows = useMemo(() => {
    const built = lines.map((line, index) => {
      const choice = choices[line.key]
      let product: BranchProduct | null = null
      let score: number | null = null
      let mode: "matched" | "new" | "none" = "none"

      if (choice?.kind === "product") {
        product = productById.get(choice.id) ?? null
        mode = product ? "matched" : "none"
      } else if (choice?.kind === "new") {
        mode = "new"
      } else if (!choice) {
        const auto = autoMatches[index]
        if (auto) {
          product = auto.product
          score = auto.score
          mode = "matched"
        }
      }

      const priceStr = newPrices[line.key] ?? String(line.price)
      const newPrice = Number(priceStr)
      const valid = Number.isFinite(newPrice) && newPrice > 0
      const current = product ? Number(product.price) : null
      const differs = current !== null && valid && Math.abs(current - newPrice) >= 0.005
      const status: Status = mode === "matched" ? (differs ? "diff" : "ok") : mode === "new" ? "new" : "missing"
      const lowConfidence = mode === "matched" && !choice && (score ?? 0) < 0.8
      const willApply = valid && (status === "diff" || status === "new") && !excluded.has(line.key)

      return { line, index, product, score, status, priceStr, newPrice, valid, current, lowConfidence, willApply, manual: !!choice }
    })

    const usage = new Map<string, number[]>()
    built.forEach((r) => {
      if (!r.product) return
      usage.set(r.product.id, [...(usage.get(r.product.id) || []), r.index + 1])
    })
    return built.map((r) => ({
      ...r,
      sharedWith: r.product ? (usage.get(r.product.id) || []).filter((n) => n !== r.index + 1) : [],
    }))
  }, [lines, choices, productById, autoMatches, newPrices, excluded])

  const stats = useMemo(() => {
    const s = { total: rows.length, ok: 0, diff: 0, missing: 0, review: 0, apply: 0, updates: 0, creates: 0 }
    for (const r of rows) {
      if (r.status === "ok") s.ok++
      if (r.status === "diff") s.diff++
      if (r.status === "missing" || r.status === "new") s.missing++
      if (r.lowConfidence || r.line.verify || r.sharedWith.length > 0) s.review++
      if (r.willApply) {
        s.apply++
        if (r.status === "diff") s.updates++
        if (r.status === "new") s.creates++
      }
    }
    return s
  }, [rows])

  const visibleRows = useMemo(() => {
    const q = normalizeText(search)
    return rows.filter((r) => {
      if (filter === "diff" && r.status !== "diff") return false
      if (filter === "ok" && r.status !== "ok") return false
      if (filter === "missing" && r.status !== "missing" && r.status !== "new") return false
      if (filter === "review" && !(r.lowConfidence || r.line.verify || r.sharedWith.length > 0)) return false
      if (!q) return true
      return (
        normalizeText(r.line.name).includes(q) ||
        (r.product ? normalizeText(r.product.name).includes(q) || (r.product.barcode || "").includes(search.trim()) : false)
      )
    })
  }, [rows, filter, search])

  const branchName = branches.find((b) => b.id === branchId)?.name || "Ojitos del camellón"

  const setChoice = (key: string, choice: Choice | null) => {
    setChoices((prev) => {
      const next = { ...prev }
      if (choice) next[key] = choice
      else delete next[key]
      return next
    })
    setExcluded((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const toggleExcluded = (key: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const setAllDiffs = (include: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      for (const r of rows) {
        if (r.status !== "diff" && r.status !== "new") continue
        if (include) next.delete(r.line.key)
        else next.add(r.line.key)
      }
      return next
    })
  }

  const markMissingAsNew = () => {
    setChoices((prev) => {
      const next = { ...prev }
      for (const r of rows) if (r.status === "missing") next[r.line.key] = { kind: "new" }
      return next
    })
  }

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key))
    setChoice(key, null)
  }

  const addPasted = (replace: boolean) => {
    const parsed = parsePriceLines(pasteText)
    if (parsed.length === 0) {
      alert('No encontré renglones con precio. Usa el formato: "Nombre del producto ---- $45.00" (uno por renglón).')
      return
    }
    if (replace) {
      setChoices({})
      setNewPrices({})
      setCreateNames({})
      setExcluded(new Set())
      setLines(toLines(parsed))
    } else {
      setLines((prev) => [...prev, ...toLines(parsed)])
    }
    setPasteText("")
  }

  const restoreSignList = () => {
    if (!confirm("¿Restaurar la lista original de la lona? Se perderán los cambios de esta revisión.")) return
    setChoices({})
    setNewPrices({})
    setCreateNames({})
    setExcluded(new Set())
    setLines(toLines(OJITOS_CAMELLON_PRICE_LIST))
  }

  const applyChanges = async () => {
    const toApply = rows.filter((r) => r.willApply)
    const updates = toApply
      .filter((r) => r.status === "diff" && r.product)
      .map((r) => ({ id: r.product!.id, price: r.newPrice }))
    const creates = toApply
      .filter((r) => r.status === "new")
      .map((r) => ({ name: (createNames[r.line.key] ?? r.line.name).trim(), price: r.newPrice }))

    if (updates.length === 0 && creates.length === 0) return
    const msg = [
      `Sucursal: ${branchName}`,
      updates.length ? `• Se actualizarán ${updates.length} precios` : "",
      creates.length ? `• Se crearán ${creates.length} productos nuevos (stock 0, costo 0)` : "",
      "",
      "¿Aplicar cambios?",
    ]
      .filter(Boolean)
      .join("\n")
    if (!confirm(msg)) return

    setApplying(true)
    setResult(null)
    try {
      const res = await fetch("/api/products/bulk-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, updates, creates }),
      })
      const json = await res.json()
      if (!res.ok) {
        alert(json.error || "No se pudieron aplicar los precios")
        return
      }
      setResult(json)
      setNewPrices({})
      setExcluded(new Set())
      setChoices((prev) => {
        const next: Record<string, Choice> = {}
        for (const [k, v] of Object.entries(prev)) if (v.kind === "product") next[k] = v
        return next
      })
      await loadProducts(branchId)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error inesperado")
    } finally {
      setApplying(false)
    }
  }

  const pickerRow = pickerKey ? rows.find((r) => r.line.key === pickerKey) : null
  const pickerResults = useMemo(() => {
    const q = normalizeText(pickerQuery)
    if (!q) return []
    const words = q.split(" ")
    return products
      .filter((p) => {
        const name = normalizeText(p.name)
        return words.every((w) => name.includes(w)) || (p.barcode || "").includes(pickerQuery.trim())
      })
      .slice(0, 40)
  }, [pickerQuery, products])

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Lista de precios"
        subtitle={`Revisar y ajustar precios · ${branchName}`}
        icon={Tags}
        actions={
          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => loadProducts()} disabled={loading}>
            <RefreshCw className={cn("mr-1 h-4 w-4", loading && "animate-spin")} />
            Recargar
          </Button>
        }
      />

      <div className={cn("space-y-5 p-4 sm:p-6 lg:px-8", stats.apply > 0 && "pb-40")}>
        <section className="grid gap-4 lg:grid-cols-12">
          <div className="bento-accent anim-rise relative overflow-hidden p-5 lg:col-span-4">
            <div className="pattern-rings pointer-events-none absolute inset-0" />
            <div className="relative space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Sucursal</p>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger className="mt-2 h-11 w-full rounded-xl border-white/20 bg-white/10 text-white [&_svg]:text-white">
                    <Store className="h-4 w-4" />
                    <SelectValue placeholder="Elegir sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.length === 0 && <SelectItem value={OJITOS_CAMELLON_BRANCH_ID}>Ojitos del camellón</SelectItem>}
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-white/65">Renglones en la lista</p>
                  <p className="text-2xl font-bold tabular-nums">
                    <CountUp value={stats.total} />
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-white/65">Productos en sucursal</p>
                  <p className="text-2xl font-bold tabular-nums">
                    {loading ? <Loader2 className="mt-1 h-5 w-5 animate-spin" /> : <CountUp value={products.length} />}
                  </p>
                </div>
              </div>
              <p className="text-[11px] leading-relaxed text-white/70">
                Cada renglón de la lona se compara con los productos de la sucursal. Revisa las coincidencias, corrige el
                precio si hace falta y aplica solo lo que marques.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-8">
            <StatTile icon={CheckCircle2} label="Precio correcto" value={stats.ok} tone="emerald" active={filter === "ok"} onClick={() => setFilter(filter === "ok" ? "all" : "ok")} index={1} />
            <StatTile icon={AlertTriangle} label="Precio diferente" value={stats.diff} tone="amber" active={filter === "diff"} onClick={() => setFilter(filter === "diff" ? "all" : "diff")} index={2} />
            <StatTile icon={SearchX} label="No encontrados" value={stats.missing} tone="rose" active={filter === "missing"} onClick={() => setFilter(filter === "missing" ? "all" : "missing")} index={3} />
            <StatTile icon={Eye} label="Por revisar" value={stats.review} tone="sky" active={filter === "review"} onClick={() => setFilter(filter === "review" ? "all" : "review")} index={4} />
          </div>
        </section>

        {loadError && (
          <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
        )}

        {result && (
          <div className="anim-rise-sm flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Listo: {result.updated} precios actualizados
                {result.created ? ` · ${result.created} productos creados` : ""}
                {result.unchanged ? ` · ${result.unchanged} ya estaban igual` : ""}
              </p>
              {result.failed.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-destructive">
                  {result.failed.map((f, i) => (
                    <li key={i}>
                      {f.name}: {f.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" onClick={() => setResult(null)} className="rounded-full p-0.5 hover:bg-emerald-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <details className="bento anim-rise-sm group overflow-hidden" style={stagger(5)}>
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <ClipboardPaste className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Agregar o pegar más precios</p>
              <p className="truncate text-xs text-muted-foreground">
                Un renglón por producto, por ejemplo: “Paracetamol 500mg ------ $10.00”
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-3 border-t p-4">
            <Textarea
              rows={5}
              className="rounded-xl font-mono text-sm"
              placeholder={"Paracetamol ------ $10.00\nIbuprofeno 400mg ---- $27.00"}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button className="press rounded-xl" onClick={() => addPasted(false)} disabled={!pasteText.trim()}>
                <ListChecks className="mr-1.5 h-4 w-4" />
                Agregar a la lista
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => addPasted(true)} disabled={!pasteText.trim()}>
                Reemplazar lista
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={restoreSignList}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Restaurar lista de la lona
              </Button>
            </div>
          </div>
        </details>

        <section className="bento anim-rise-sm p-3" style={stagger(6)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar en la lista o en el producto encontrado…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-xl border-transparent bg-muted/50 pl-10 focus-visible:bg-background"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="h-11 rounded-xl" onClick={() => setAllDiffs(true)}>
                Marcar todos
              </Button>
              <Button variant="outline" size="sm" className="h-11 rounded-xl" onClick={() => setAllDiffs(false)}>
                Desmarcar todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 rounded-xl"
                onClick={markMissingAsNew}
                disabled={!rows.some((r) => r.status === "missing")}
              >
                <PackagePlus className="mr-1.5 h-4 w-4" />
                Crear todos los no encontrados
              </Button>
            </div>
          </div>
          {filter !== "all" && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3 text-xs">
              <span className="text-muted-foreground">Filtrando:</span>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="press inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
              >
                {FILTER_LABEL[filter]}
                <X className="h-3 w-3" />
              </button>
              <span className="text-muted-foreground">{visibleRows.length} renglones</span>
            </div>
          )}
        </section>

        {loading ? (
          <div className="bento grid place-items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Cargando productos de {branchName}…
          </div>
        ) : (
          <div className="bento anim-rise-sm overflow-hidden">
            <div className="hidden grid-cols-[36px_minmax(0,1fr)_24px_minmax(0,1.3fr)_110px_130px_120px_36px] gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold text-muted-foreground lg:grid">
              <span />
              <span>En la lista</span>
              <span />
              <span>Producto en la sucursal</span>
              <span className="text-right">Precio actual</span>
              <span>Precio nuevo</span>
              <span>Estado</span>
              <span />
            </div>
            {visibleRows.length === 0 && (
              <p className="py-12 text-center text-sm text-muted-foreground">No hay renglones con este filtro.</p>
            )}
            <div className="divide-y">
              {visibleRows.map((r) => {
                const selectable = r.status === "diff" || r.status === "new"
                const diffAmount = r.current !== null && r.valid ? r.newPrice - r.current : 0
                return (
                  <div
                    key={r.line.key}
                    className={cn(
                      "grid grid-cols-[36px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors lg:grid-cols-[36px_minmax(0,1fr)_24px_minmax(0,1.3fr)_110px_130px_120px_36px]",
                      r.willApply && "bg-primary/[0.03]",
                    )}
                  >
                    <div className="row-span-4 flex justify-center self-start pt-1 lg:row-span-1 lg:self-center lg:pt-0">
                      {selectable ? (
                        <Checkbox
                          checked={!excluded.has(r.line.key)}
                          disabled={!r.valid}
                          onCheckedChange={() => toggleExcluded(r.line.key)}
                          aria-label="Aplicar este cambio"
                        />
                      ) : r.status === "ok" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <span className="text-xs tabular-nums text-muted-foreground">{r.index + 1}</span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={r.line.name}>
                        {r.line.name}
                      </p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        Lona: <b className="text-foreground">{formatMoney(r.line.price)}</b>
                        {r.line.verify && <Pill tone="sky">Revisar precio en la lona</Pill>}
                      </p>
                    </div>

                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground lg:block" />

                    <div className="min-w-0">
                      {r.status === "new" ? (
                        <div className="space-y-1">
                          <Input
                            className="h-9 rounded-lg"
                            value={createNames[r.line.key] ?? r.line.name}
                            onChange={(e) => setCreateNames((prev) => ({ ...prev, [r.line.key]: e.target.value }))}
                            aria-label="Nombre del producto nuevo"
                          />
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground">Se creará con stock 0 y costo 0.</span>
                            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setPickerKey(r.line.key)}>
                              Buscar otra vez
                            </button>
                          </div>
                        </div>
                      ) : r.product ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPickerKey(r.line.key)
                            setPickerQuery("")
                          }}
                          className="group/match w-full rounded-xl px-2 py-1 text-left transition-colors hover:bg-muted/60"
                        >
                          <p className="truncate font-medium" title={r.product.name}>
                            {r.product.name}
                          </p>
                          <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="font-mono">{r.product.barcode || "Sin código"}</span>
                            {r.product.section && <span>· Secc. {r.product.section}</span>}
                            {r.manual ? (
                              <Pill tone="primary">Elegido a mano</Pill>
                            ) : (
                              r.score !== null && (
                                <Pill tone={r.lowConfidence ? "sky" : "slate"}>Parecido {Math.round(r.score * 100)}%</Pill>
                              )
                            )}
                            {r.sharedWith.length > 0 && <Pill tone="amber">También en renglón {r.sharedWith.join(", ")}</Pill>}
                            <span className="font-semibold text-primary opacity-0 transition-opacity group-hover/match:opacity-100">
                              Cambiar
                            </span>
                          </p>
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-muted-foreground">No se encontró en la sucursal</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 rounded-lg"
                            onClick={() => {
                              setPickerKey(r.line.key)
                              setPickerQuery("")
                            }}
                          >
                            <Search className="mr-1 h-3.5 w-3.5" />
                            Buscar
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setChoice(r.line.key, { kind: "new" })}>
                            <PackagePlus className="mr-1 h-3.5 w-3.5" />
                            Crear
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="col-start-2 flex items-center gap-3 lg:col-start-auto lg:contents">
                      <p className="text-sm tabular-nums lg:text-right">
                        <span className="text-xs text-muted-foreground lg:hidden">Actual: </span>
                        {r.current !== null ? formatMoney(r.current) : "—"}
                      </p>

                      <div className="relative w-32 lg:w-auto">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          className={cn(
                            "h-9 rounded-lg pl-6 font-semibold tabular-nums",
                            !r.valid && "border-destructive",
                            r.status === "diff" && "border-amber-400",
                          )}
                          value={r.priceStr}
                          onChange={(e) => setNewPrices((prev) => ({ ...prev, [r.line.key]: e.target.value }))}
                        />
                      </div>

                      <div>
                        {r.status === "ok" && <Pill tone="emerald">Correcto</Pill>}
                        {r.status === "diff" && (
                          <Pill tone="amber">
                            {diffAmount > 0 ? "Sube " : "Baja "}
                            {formatMoney(Math.abs(diffAmount))}
                          </Pill>
                        )}
                        {r.status === "missing" && <Pill tone="rose">No encontrado</Pill>}
                        {r.status === "new" && <Pill tone="primary">Nuevo</Pill>}
                      </div>
                    </div>

                    <div className="col-start-2 flex justify-end lg:col-start-auto">
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        title="Quitar renglón de la lista"
                        onClick={() => removeLine(r.line.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {stats.apply > 0 && (
        <div className="anim-rise-sm fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 p-3 shadow-[0_-12px_40px_-16px_rgb(0_0_0/0.25)] backdrop-blur-md sm:p-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Wand2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-bold">
                  {stats.apply} cambio{stats.apply === 1 ? "" : "s"} listo{stats.apply === 1 ? "" : "s"}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {stats.updates} precios por actualizar
                  {stats.creates ? ` · ${stats.creates} productos nuevos` : ""} · {branchName}
                </p>
              </div>
            </div>
            <Button className="shine press rounded-xl" disabled={applying} onClick={applyChanges}>
              {applying ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
              {applying ? "Aplicando..." : "Aplicar precios"}
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={!!pickerKey}
        onOpenChange={(open) => {
          if (!open) {
            setPickerKey(null)
            setPickerQuery("")
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Elegir producto</DialogTitle>
            <DialogDescription>
              {pickerRow ? `“${pickerRow.line.name}” · lona ${formatMoney(pickerRow.line.price)}` : ""}
            </DialogDescription>
          </DialogHeader>

          {pickerRow && (
            <div className="space-y-4">
              {candidates[pickerRow.index]?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sugerencias</p>
                  {candidates[pickerRow.index].map((c) => (
                    <PickItem
                      key={c.product.id}
                      product={c.product}
                      hint={`${Math.round(c.score * 100)}%`}
                      active={pickerRow.product?.id === c.product.id}
                      onPick={() => {
                        setChoice(pickerRow.line.key, { kind: "product", id: c.product.id })
                        setPickerKey(null)
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buscar en la sucursal</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="h-10 rounded-xl pl-9"
                    placeholder="Nombre o código de barras"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                  />
                </div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {pickerResults.map((p) => (
                    <PickItem
                      key={p.id}
                      product={p}
                      active={pickerRow.product?.id === p.id}
                      onPick={() => {
                        setChoice(pickerRow.line.key, { kind: "product", id: p.id })
                        setPickerKey(null)
                      }}
                    />
                  ))}
                  {pickerQuery.trim() && pickerResults.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t pt-3">
                {pickerRow.manual && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      setChoice(pickerRow.line.key, null)
                      setPickerKey(null)
                    }}
                  >
                    <Wand2 className="mr-1.5 h-4 w-4" />
                    Volver a automático
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setChoice(pickerRow.line.key, { kind: "new" })
                    setPickerKey(null)
                  }}
                >
                  <PackagePlus className="mr-1.5 h-4 w-4" />
                  Crear como producto nuevo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setChoice(pickerRow.line.key, { kind: "none" })
                    setPickerKey(null)
                  }}
                >
                  No está en esta sucursal
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const FILTER_LABEL: Record<Filter, string> = {
  all: "Todos",
  diff: "Precio diferente",
  ok: "Precio correcto",
  missing: "No encontrados",
  review: "Por revisar",
}

type Tone = "emerald" | "amber" | "rose" | "sky" | "slate" | "primary"

const PILL_TONES: Record<Tone, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  rose: "bg-rose-100 text-rose-700 ring-rose-200",
  sky: "bg-sky-100 text-sky-800 ring-sky-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
  primary: "bg-primary/10 text-primary ring-primary/20",
}

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
        PILL_TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

const TILE_ICON: Record<"emerald" | "amber" | "rose" | "sky", { icon: string; ring: string }> = {
  emerald: { icon: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-400" },
  amber: { icon: "bg-amber-100 text-amber-700", ring: "ring-amber-400" },
  rose: { icon: "bg-rose-100 text-rose-700", ring: "ring-rose-400" },
  sky: { icon: "bg-sky-100 text-sky-700", ring: "ring-sky-400" },
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
  active,
  onClick,
  index,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone: keyof typeof TILE_ICON
  active: boolean
  onClick: () => void
  index: number
}) {
  const t = TILE_ICON[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "bento bento-hover press anim-rise-sm flex min-h-[8.5rem] flex-col justify-between p-4 text-left",
        active && cn("ring-2 ring-offset-2 ring-offset-background", t.ring),
      )}
      style={stagger(index)}
    >
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", t.icon)}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-3xl font-bold tabular-nums leading-none">
          <CountUp value={value} />
        </p>
        <p className="mt-1 text-sm font-semibold">{label}</p>
      </div>
    </button>
  )
}

function PickItem({
  product,
  hint,
  active,
  onPick,
}: {
  product: BranchProduct
  hint?: string
  active?: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "press flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.03]",
        active && "border-primary bg-primary/[0.05]",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          <span className="font-mono">{product.barcode || "Sin código"}</span>
          {product.section ? ` · Secc. ${product.section}` : ""}
          {typeof product.stock_quantity === "number" ? ` · ${product.stock_quantity} pzas` : ""}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums">{formatMoney(product.price)}</span>
      {hint && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">{hint}</span>}
    </button>
  )
}
