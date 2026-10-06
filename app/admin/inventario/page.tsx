"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  CalendarRange,
  Check,
  CheckCircle2,
  ClipboardPenLine,
  Download,
  FileSpreadsheet,
  HelpCircle,
  ListChecks,
  Loader2,
  PackageSearch,
  Search,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Upload,
  UploadCloud,
  type LucideIcon,
} from "lucide-react"
import { CountUp, stagger } from "@/components/motion"
import {
  exportInventoryCountCsv,
  parseInventoryCountFile,
  type InventoryCountRow,
} from "@/lib/inventory-count"
import { formatMoney, roundMoney } from "@/lib/money"
import { getPeriodRange, todayLocalISODate, type PeriodPreset } from "@/lib/periods"
import { cn } from "@/lib/utils"

type CountStatus = "correct" | "missing" | "surplus" | "unregistered"
type FilterKey = "all" | CountStatus

type CompareRow = {
  barcode: string
  product_id?: string | null
  product_name: string
  file_name?: string | null
  system_stock: number
  counted: number
  difference: number
  status: CountStatus
  unit_cost?: number
  unit_price?: number
  price_from_branch?: string | null
  entries_qty?: number
}

type CompareSummary = {
  reviewed: number
  correct: number
  missing: number
  surplus: number
  unregistered: number
  to_update: number
}

const STATUS_LABEL: Record<CountStatus, string> = {
  correct: "Correcto",
  missing: "Faltante",
  surplus: "Sobrante",
  unregistered: "No registrado",
}

export default function AdminInventarioPage() {
  const router = useRouter()
  const supabase = createClient()

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [branchId, setBranchId] = useState("")
  const [fileName, setFileName] = useState("")
  const [parsedRows, setParsedRows] = useState<InventoryCountRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [comparing, setComparing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rows, setRows] = useState<CompareRow[]>([])
  const [summary, setSummary] = useState<CompareSummary | null>(null)
  const [filter, setFilter] = useState<FilterKey>("all")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("week")
  const [periodStart, setPeriodStart] = useState(() => getPeriodRange("week").start)
  const [periodEnd, setPeriodEnd] = useState(() => getPeriodRange("week").end)
  const [resultSearch, setResultSearch] = useState("")
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    checkAuth()
    loadBranches()
  }, [])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return router.push("/auth/login")
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "admin") router.push("/cajero")
  }

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (res.ok) {
      const json = await res.json()
      setBranches(json.branches || [])
    }
  }

  const resetResults = () => {
    setRows([])
    setSummary(null)
    setReviewed(false)
    setSuccess("")
    setFilter("all")
    if (step > 2) setStep(2)
  }

  const onBranchChange = (value: string) => {
    setBranchId(value)
    setError("")
    setSuccess("")
    if (value) setStep((s) => (s < 2 ? 2 : s))
    resetResults()
  }

  const onFileSelected = async (file: File | null) => {
    setParseErrors([])
    setError("")
    setSuccess("")
    setParsedRows([])
    setFileName("")
    resetResults()

    if (!file) return

    setFileName(file.name)
    const parsed = await parseInventoryCountFile(file)
    if (!parsed.ok) {
      setParseErrors(parsed.errors)
      setStep(2)
      return
    }

    setParsedRows(parsed.rows)
    setStep(2)
  }

  const runCompare = async () => {
    setError("")
    setSuccess("")
    setParseErrors([])

    if (!branchId) {
      setError("Selecciona una sucursal")
      return
    }
    if (parsedRows.length === 0) {
      setError("Sube un archivo Excel/CSV válido")
      return
    }

    setComparing(true)
    try {
      const res = await fetch("/api/inventory/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compare",
          branch_id: branchId,
          items: parsedRows,
          start_date: periodStart,
          end_date: periodEnd,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "No se pudo comparar el inventario")
        return
      }

      const result = json.result
      setRows((result?.rows || []) as CompareRow[])
      setSummary(result?.summary || null)
      setReviewed(false)
      setStep(3)
    } catch {
      setError("Error de red al comparar el inventario")
    } finally {
      setComparing(false)
    }
  }

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const toUpdateCount = useMemo(
    () => rows.filter((r) => r.status === "missing" || r.status === "surplus").length,
    [rows],
  )

  /** Estimado: faltantes + no registrados + correctos vía altas del periodo */
  const qtyTotals = useMemo(() => {
    const empty = { products: 0, system: 0, counted: 0, diff: 0 }
    const byStatus: Record<CountStatus, typeof empty> = {
      correct: { ...empty },
      missing: { ...empty },
      surplus: { ...empty },
      unregistered: { ...empty },
    }

    let countedAll = 0
    let missingUnits = 0
    let surplusUnits = 0
    let unregisteredUnits = 0
    let correctEntryUnits = 0
    let missingEarningsMxn = 0
    let unregisteredEarningsMxn = 0
    let correctEarningsMxn = 0
    let estimatedProfitMxn = 0

    for (const row of rows) {
      const bucket = byStatus[row.status]
      bucket.products += 1
      bucket.system += row.system_stock
      bucket.counted += row.counted
      bucket.diff += row.difference
      countedAll += row.counted

      const unitPrice = Number(row.unit_price) || 0
      const unitCost = Number(row.unit_cost) || 0
      const entriesQty = Math.max(0, Number(row.entries_qty) || 0)

      if (row.status === "missing") {
        const soldUnits = row.system_stock - row.counted
        missingUnits += soldUnits
        missingEarningsMxn = roundMoney(missingEarningsMxn + soldUnits * unitPrice)
        estimatedProfitMxn = roundMoney(estimatedProfitMxn + soldUnits * (unitPrice - unitCost))
      }

      if (row.status === "unregistered") {
        unregisteredUnits += row.counted
        unregisteredEarningsMxn = roundMoney(unregisteredEarningsMxn + row.counted * unitPrice)
      }

      if (row.status === "correct") {
        // Ventas no están en plataforma (solo altas): si cuadra, altas del periodo ≈ vendido
        correctEntryUnits += entriesQty
        correctEarningsMxn = roundMoney(correctEarningsMxn + entriesQty * unitPrice)
        estimatedProfitMxn = roundMoney(estimatedProfitMxn + entriesQty * (unitPrice - unitCost))
      }

      if (row.status === "surplus") {
        surplusUnits += row.counted - row.system_stock
      }
    }

    return {
      byStatus,
      countedAll,
      missingUnits,
      surplusUnits,
      unregisteredUnits,
      correctEntryUnits,
      missingEarningsMxn,
      unregisteredEarningsMxn,
      correctEarningsMxn,
      estimatedEarningsMxn: roundMoney(missingEarningsMxn + unregisteredEarningsMxn + correctEarningsMxn),
      estimatedProfitMxn,
      soldUnitsTotal: missingUnits + unregisteredUnits + correctEntryUnits,
    }
  }, [rows])

  const onPeriodPresetChange = (preset: PeriodPreset) => {
    setPeriodPreset(preset)
    if (preset !== "custom") {
      const range = getPeriodRange(preset)
      setPeriodStart(range.start)
      setPeriodEnd(range.end)
    }
  }
  const applyAdjustments = async () => {
    setApplying(true)
    setError("")
    setSuccess("")
    try {
      const applyItems = rows
        .filter((r) => r.status === "missing" || r.status === "surplus")
        .map((r) => ({ barcode: r.barcode, name: r.product_name, quantity: r.counted }))

      // Venta = mismo estimado de ganancias (faltantes + correctos/altas + no registrados)
      const saleItems: Array<{
        barcode: string
        product_id?: string | null
        quantity: number
        unit_price: number
        unit_cost: number
        source: string
      }> = []

      for (const row of rows) {
        const unitPrice = Number(row.unit_price) || 0
        const unitCost = Number(row.unit_cost) || 0

        if (row.status === "missing") {
          const qty = row.system_stock - row.counted
          if (qty > 0) {
            saleItems.push({
              barcode: row.barcode,
              product_id: row.product_id,
              quantity: qty,
              unit_price: unitPrice,
              unit_cost: unitCost,
              source: "missing",
            })
          }
        }

        if (row.status === "correct") {
          const qty = Math.max(0, Number(row.entries_qty) || 0)
          if (qty > 0) {
            saleItems.push({
              barcode: row.barcode,
              product_id: row.product_id,
              quantity: qty,
              unit_price: unitPrice,
              unit_cost: unitCost,
              source: "correct_entries",
            })
          }
        }

        if (row.status === "unregistered") {
          const qty = row.counted
          if (qty > 0 && unitPrice > 0) {
            saleItems.push({
              barcode: row.barcode,
              product_id: row.product_id,
              quantity: qty,
              unit_price: unitPrice,
              unit_cost: unitCost,
              source: "unregistered",
            })
          }
        }
      }

      if (applyItems.length === 0 && saleItems.length === 0) {
        setError("No hay nada para aplicar: sin diferencias de stock ni estimado de venta")
        return
      }

      const res = await fetch("/api/inventory/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          branch_id: branchId,
          apply_items: applyItems,
          sale_items: saleItems,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "No se pudieron aplicar los ajustes")
        return
      }

      const updated = json.result?.updated ?? 0
      const saleTotal = Number(json.result?.sale_total) || 0
      const saleQty = Number(json.result?.sale_qty) || 0
      const saleId = json.result?.sale_id
      setSuccess(
        saleId
          ? `Listo. Stock ajustado (${updated} productos) y venta registrada por el estimado: ${formatMoney(saleTotal)} MXN (${saleQty} pzas.).`
          : `Ajuste aplicado (${updated} productos). No se generó venta (estimado en $0.00).`,
      )
      setStep(4)
      setConfirmOpen(false)

      await runCompareAfterApply()
    } catch {
      setError("Error de red al aplicar el ajuste")
    } finally {
      setApplying(false)
    }
  }

  const runCompareAfterApply = async () => {
    const res = await fetch("/api/inventory/count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "compare",
        branch_id: branchId,
        items: parsedRows,
        start_date: periodStart,
        end_date: periodEnd,
      }),
    })
    const json = await res.json()
    if (res.ok) {
      setRows((json.result?.rows || []) as CompareRow[])
      setSummary(json.result?.summary || null)
      setReviewed(true)
    }
  }

  const downloadExport = () => {
    const csv = exportInventoryCountCsv(rows, (status) => STATUS_LABEL[status as CountStatus] || status)
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const branchName = branches.find((b) => b.id === branchId)?.name || "sucursal"
    a.href = url
    a.download = `conteo-inventario-${branchName.replace(/\s+/g, "-").toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatDiff = (diff: number) => {
    if (diff > 0) return `+${diff}`
    return String(diff)
  }

  const searchTerm = resultSearch.trim().toLowerCase()
  const visibleRows = searchTerm
    ? filteredRows.filter(
        (r) =>
          r.barcode.toLowerCase().includes(searchTerm) ||
          (r.product_name || "").toLowerCase().includes(searchTerm) ||
          (r.file_name || "").toLowerCase().includes(searchTerm),
      )
    : filteredRows
  const branchName = branches.find((b) => b.id === branchId)?.name
  const fileDisabled = !branchId || comparing || applying

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Conteo de Inventario"
        subtitle="Compara el conteo físico contra el stock del sistema por sucursal"
        icon={ClipboardPenLine}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="press rounded-xl"
              onClick={() => router.push("/admin/inventario/pedido")}
            >
              <PackageSearch className="mr-2 h-4 w-4" />
              Pedir stock 0
            </Button>
            {rows.length > 0 ? (
              <Button size="sm" className="shine press rounded-xl" onClick={downloadExport}>
                <Download className="mr-2 h-4 w-4" />
                Exportar resultado
              </Button>
            ) : null}
          </>
        }
      />

      <div className="space-y-5 p-4 sm:p-6 lg:px-8">
        <div className="bento anim-rise-sm px-4 py-4 sm:px-6">
          <ol className="flex items-center">
            {STEPS.map((s, i) => {
              const done = step > s.n
              const current = step === s.n
              return (
                <li key={s.n} className={cn("flex items-center", i < STEPS.length - 1 && "flex-1")}>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-[background-color,color,box-shadow] duration-500",
                        done && "bg-primary text-primary-foreground",
                        current && "pulse-ring bg-primary text-primary-foreground",
                        !done && !current && "bg-muted text-muted-foreground",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : s.n}
                    </span>
                    <span
                      className={cn(
                        "hidden text-sm font-medium sm:inline",
                        step >= s.n ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 ? (
                    <div className="mx-2 h-1 flex-1 overflow-hidden rounded-full bg-muted sm:mx-4">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-700 [transition-timing-function:var(--ease-out-4)]"
                        style={{ width: step > s.n ? "100%" : "0%" }}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        </div>

        {error ? (
          <Alert variant="destructive" className="anim-pop rounded-2xl">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert className="anim-pop rounded-2xl border-emerald-200 bg-emerald-50 text-emerald-900">
            <CheckCircle2 className="h-4 w-4 text-emerald-600!" />
            <AlertTitle>Éxito</AlertTitle>
            <AlertDescription className="text-emerald-800">{success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Store className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>1. Sucursal y periodo</CardTitle>
                  <CardDescription className="mt-1">
                    El conteo solo afecta esta sucursal. El periodo define qué altas se usan para estimar ventas en
                    productos correctos.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label className="mb-2 block">Sucursal</Label>
                <Select value={branchId} onValueChange={onBranchChange}>
                  <SelectTrigger className="h-11 rounded-2xl">
                    <SelectValue placeholder="Seleccionar sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 flex items-center gap-1.5">
                  <CalendarRange className="h-4 w-4 text-muted-foreground" />
                  Periodo de altas (para correctos)
                </Label>
                <div className="inline-flex max-w-full overflow-x-auto rounded-2xl bg-muted p-1">
                  {PERIOD_OPTIONS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onPeriodPresetChange(key)}
                      className={cn(
                        "press whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-300",
                        periodPreset === key
                          ? "bg-card text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Desde</Label>
                    <Input
                      type="date"
                      className="rounded-xl"
                      value={periodStart}
                      max={todayLocalISODate()}
                      onChange={(e) => {
                        setPeriodPreset("custom")
                        setPeriodStart(e.target.value)
                      }}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Hasta</Label>
                    <Input
                      type="date"
                      className="rounded-xl"
                      value={periodEnd}
                      max={todayLocalISODate()}
                      onChange={(e) => {
                        setPeriodPreset("custom")
                        setPeriodEnd(e.target.value)
                      }}
                    />
                  </div>
                </div>
                <p className="mt-3 rounded-2xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  Como las ventas no se registran aquí (solo altas), en productos correctos se estima con las entradas
                  del periodo.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileSpreadsheet className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle>2. Archivo de conteo</CardTitle>
                  <CardDescription className="mt-1">
                    Con encabezado: Código de barras, Nombre, Cantidad — o sin encabezado en ese mismo orden (.csv /
                    .xlsx / .xls)
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!fileDisabled) setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (fileDisabled) return
                  onFileSelected(e.dataTransfer.files?.[0] || null)
                }}
                aria-disabled={fileDisabled}
                className={cn(
                  "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition-[border-color,background-color,transform] duration-300",
                  dragOver
                    ? "scale-[1.01] border-primary bg-primary/5"
                    : "border-foreground/10 hover:border-primary/40 hover:bg-primary/[0.03]",
                  fileDisabled && "pointer-events-none opacity-55",
                )}
              >
                <input
                  type="file"
                  className="sr-only"
                  accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  disabled={fileDisabled}
                  onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
                />
                <span
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:-translate-y-1 group-hover:scale-110",
                    fileName && parseErrors.length === 0
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {fileName && parseErrors.length === 0 ? (
                    <CheckCircle2 className="h-7 w-7" />
                  ) : (
                    <UploadCloud className="h-7 w-7" />
                  )}
                </span>
                {fileName ? (
                  <>
                    <p className="max-w-full truncate font-semibold">{fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {parsedRows.length} productos · toca para cambiar el archivo
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">
                      {branchId ? "Arrastra tu Excel aquí o toca para elegir" : "Primero elige la sucursal"}
                    </p>
                    <p className="text-sm text-muted-foreground">.csv, .xlsx o .xls</p>
                  </>
                )}
              </label>

              {parseErrors.length > 0 ? (
                <div className="anim-pop max-h-40 overflow-auto rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {parseErrors.map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </div>
              ) : null}

              <Button
                className="shine press h-11 w-full rounded-2xl text-base font-semibold"
                onClick={runCompare}
                disabled={!branchId || parsedRows.length === 0 || comparing || !!parseErrors.length}
              >
                {comparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Comparar con stock
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Esta acción no modifica el inventario. El stock solo cambia al aplicar el ajuste.
              </p>
            </CardContent>
          </Card>
        </div>

        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <SummaryTile
                index={0}
                icon={ListChecks}
                label="Revisados"
                value={summary.reviewed}
                detail={`${qtyTotals.countedAll} piezas en el Excel`}
                tone="primary"
                active={filter === "all"}
                onClick={() => setFilter("all")}
              />
              <SummaryTile
                index={1}
                icon={CheckCircle2}
                label="Correctos"
                value={summary.correct}
                detail={`${qtyTotals.correctEntryUnits} pzas. altas → estimado`}
                tone="correct"
                active={filter === "correct"}
                onClick={() => setFilter("correct")}
              />
              <SummaryTile
                index={2}
                icon={TrendingDown}
                label="Faltantes"
                value={summary.missing}
                detail={`${qtyTotals.missingUnits} piezas menos en físico`}
                tone="missing"
                active={filter === "missing"}
                onClick={() => setFilter("missing")}
              />
              <SummaryTile
                index={3}
                icon={TrendingUp}
                label="Sobrantes"
                value={summary.surplus}
                detail={`${qtyTotals.surplusUnits} piezas de más`}
                tone="surplus"
                active={filter === "surplus"}
                onClick={() => setFilter("surplus")}
              />
              <SummaryTile
                index={4}
                icon={HelpCircle}
                label="No registrados"
                value={summary.unregistered}
                detail={`${qtyTotals.unregisteredUnits} pzas. (sí entran al estimado)`}
                tone="unregistered"
                active={filter === "unregistered"}
                onClick={() => setFilter("unregistered")}
              />
            </div>

            <div className="bento-accent anim-rise relative overflow-hidden p-5 sm:p-6" style={stagger(2)}>
              <div aria-hidden="true" className="pattern-rings pointer-events-none absolute inset-0" />
              <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-white/75">
                    <Sparkles className="h-4 w-4" />
                    Estimado de ganancias{branchName ? ` · ${branchName}` : ""}
                  </p>
                  <p className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
                    <CountUp value={qtyTotals.estimatedEarningsMxn} format={formatMoney} />
                  </p>
                  <p className="mt-2 text-sm text-white/75">
                    Utilidad aprox. (precio − costo):{" "}
                    <span className="font-semibold text-white">{formatMoney(qtyTotals.estimatedProfitMxn)} MXN</span>
                  </p>
                  <p className="mt-3 text-xs text-white/60">
                    Faltantes + no registrados + correctos (altas del {periodStart} al {periodEnd}). Sobrantes no
                    entran. Aproximado porque las ventas no se capturan en la plataforma.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <EstimateTile
                    label="Faltantes (sistema − conteo)"
                    units={qtyTotals.missingUnits}
                    amount={qtyTotals.missingEarningsMxn}
                  />
                  <EstimateTile
                    label="Correctos (altas del periodo)"
                    units={qtyTotals.correctEntryUnits}
                    amount={qtyTotals.correctEarningsMxn}
                  />
                  <EstimateTile
                    label="No registrados"
                    units={qtyTotals.unregisteredUnits}
                    amount={qtyTotals.unregisteredEarningsMxn}
                  />
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-xs text-white/70">Total piezas estimadas</p>
                    <p className="mt-1 text-2xl font-bold">
                      <CountUp value={qtyTotals.soldUnitsTotal} />
                    </p>
                    <p className="text-[11px] text-white/60">Sobrantes excluidos</p>
                  </div>
                </div>
              </div>
            </div>

            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <PackageSearch className="h-5 w-5" />
                    </span>
                    <div>
                      <CardTitle>3. Resultados de comparación</CardTitle>
                      <CardDescription className="mt-1">
                        Revisa las diferencias antes de aplicar. Los no registrados no se insertan automáticamente.
                      </CardDescription>
                    </div>
                  </div>
                  <div className="relative lg:w-72">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={resultSearch}
                      onChange={(e) => setResultSearch(e.target.value)}
                      placeholder="Buscar código o producto..."
                      className="h-10 rounded-2xl border-0 bg-muted pl-10"
                    />
                  </div>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(
                    [
                      ["all", "Todos", qtyTotals.countedAll],
                      ["correct", "Correctos", qtyTotals.correctEntryUnits],
                      ["missing", "Faltantes", qtyTotals.missingUnits],
                      ["surplus", "Sobrantes", qtyTotals.surplusUnits],
                      ["unregistered", "No registrados", qtyTotals.unregisteredUnits],
                    ] as const
                  ).map(([key, label, units]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFilter(key)}
                      className={cn(
                        "press flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-[background-color,color,box-shadow] duration-300",
                        filter === key
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {key !== "all" ? <span className={cn("h-2 w-2 rounded-full", STATUS_STYLE[key].dot)} /> : null}
                      {label}
                      <span className="opacity-70">({units} pzas.)</span>
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-foreground/[0.06]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código de barras</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Stock sistema</TableHead>
                        <TableHead className="text-right">Conteo físico</TableHead>
                        <TableHead className="text-right">Diferencia</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                            {searchTerm ? "Ningún producto coincide con la búsqueda" : "Sin resultados en este filtro"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        visibleRows.map((row) => (
                          <TableRow key={row.barcode}>
                            <TableCell className="font-mono text-sm">{row.barcode}</TableCell>
                            <TableCell className="whitespace-normal">
                              <p className="font-medium">{row.product_name}</p>
                              {row.file_name && row.file_name !== row.product_name ? (
                                <p className="text-xs text-muted-foreground">Archivo: {row.file_name}</p>
                              ) : null}
                              {row.status === "unregistered" && row.price_from_branch ? (
                                <p className="text-xs text-muted-foreground">
                                  Precio ref. {formatMoney(Number(row.unit_price) || 0)} MXN · {row.price_from_branch}
                                </p>
                              ) : null}
                              {row.status === "correct" && (Number(row.entries_qty) || 0) > 0 ? (
                                <p className="text-xs text-muted-foreground">
                                  Altas periodo: {row.entries_qty} pzas. ·{" "}
                                  {formatMoney((Number(row.entries_qty) || 0) * (Number(row.unit_price) || 0))} MXN
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{row.system_stock}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{row.counted}</TableCell>
                            <TableCell className="text-right">
                              <span
                                className={cn(
                                  "inline-flex min-w-[3rem] justify-center rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums",
                                  row.difference < 0 && "bg-red-500/10 text-red-700",
                                  row.difference > 0 && "bg-amber-500/10 text-amber-700",
                                  row.difference === 0 && "bg-muted text-muted-foreground",
                                )}
                              >
                                {formatDiff(row.difference)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                                  STATUS_STYLE[row.status].badge,
                                )}
                              >
                                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLE[row.status].dot)} />
                                {STATUS_LABEL[row.status]}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded accent-[var(--primary)]"
                      checked={reviewed}
                      onChange={(e) => {
                        setReviewed(e.target.checked)
                        if (e.target.checked) setStep(4)
                      }}
                    />
                    Ya revisé los resultados del conteo
                  </label>

                  <Button
                    className="shine press h-11 rounded-2xl px-5 font-semibold"
                    disabled={!reviewed || (toUpdateCount === 0 && qtyTotals.estimatedEarningsMxn <= 0) || applying}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Aplicar ajuste y registrar venta
                  </Button>
                </div>

                {reviewed && toUpdateCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay diferencias por aplicar (todo correcto o solo no registrados).
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ajuste de inventario</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  ¿Deseas aplicar los ajustes? Se actualizará el stock (faltantes/sobrantes) y se registrará una venta
                  por el estimado de ganancias completo.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-muted p-3">
                    <p className="text-xs">Stock a modificar</p>
                    <p className="text-xl font-bold text-foreground">{toUpdateCount} productos</p>
                  </div>
                  <div className="rounded-2xl bg-primary/10 p-3">
                    <p className="text-xs text-primary">Venta (estimado)</p>
                    <p className="text-xl font-bold text-primary">
                      {formatMoney(qtyTotals.estimatedEarningsMxn)}
                    </p>
                    <p className="text-xs text-primary/80">{qtyTotals.soldUnitsTotal} pzas.</p>
                  </div>
                </div>
                <p className="text-xs">
                  Incluye faltantes ({formatMoney(qtyTotals.missingEarningsMxn)}) + correctos/altas (
                  {formatMoney(qtyTotals.correctEarningsMxn)}) + no registrados (
                  {formatMoney(qtyTotals.unregisteredEarningsMxn)}).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl" disabled={applying}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl"
              onClick={(e) => {
                e.preventDefault()
                applyAdjustments()
              }}
              disabled={applying}
            >
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar y aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const STEPS = [
  { n: 1, label: "Sucursal" },
  { n: 2, label: "Archivo" },
  { n: 3, label: "Revisar" },
  { n: 4, label: "Aplicar" },
] as const

const PERIOD_OPTIONS: [PeriodPreset, string][] = [
  ["day", "Hoy"],
  ["week", "7 días"],
  ["month", "Este mes"],
  ["custom", "Personalizado"],
]

const STATUS_STYLE: Record<CountStatus, { badge: string; dot: string }> = {
  correct: { badge: "bg-emerald-500/10 text-emerald-700", dot: "bg-emerald-500" },
  missing: { badge: "bg-red-500/10 text-red-700", dot: "bg-red-500" },
  surplus: { badge: "bg-amber-500/10 text-amber-700", dot: "bg-amber-500" },
  unregistered: { badge: "bg-slate-500/10 text-slate-700", dot: "bg-slate-400" },
}

const TILE_TONES = {
  primary: "bg-primary/10 text-primary",
  correct: "bg-emerald-500/10 text-emerald-600",
  missing: "bg-red-500/10 text-red-600",
  surplus: "bg-amber-500/10 text-amber-600",
  unregistered: "bg-slate-500/10 text-slate-600",
} as const

function SummaryTile({
  index,
  icon: Icon,
  label,
  value,
  detail,
  tone,
  active,
  onClick,
}: {
  index: number
  icon: LucideIcon
  label: string
  value: number
  detail?: string
  tone: keyof typeof TILE_TONES
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bento bento-hover anim-rise group p-4 text-left",
        active && "ring-2 ring-primary/60",
      )}
      style={stagger(index)}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-xl transition-transform duration-500 [transition-timing-function:var(--ease-back)] group-hover:rotate-6 group-hover:scale-110",
            TILE_TONES[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={cn(
          "mt-2 text-3xl font-bold tracking-tight",
          tone === "missing" && "text-red-600",
          tone === "surplus" && "text-amber-600",
        )}
      >
        <CountUp value={value} delay={index * 60} />
      </p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </button>
  )
}

function EstimateTile({ label, units, amount }: { label: string; units: number; amount: number }) {
  return (
    <div className="rounded-2xl bg-white/10 p-3">
      <p className="text-xs text-white/70">{label}</p>
      <p className="mt-1 text-xl font-bold">{units} pzas.</p>
      <p className="text-sm font-medium text-white/85">{formatMoney(amount)} MXN</p>
    </div>
  )
}
