"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  PackageSearch,
  Upload,
} from "lucide-react"
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

const STATUS_VARIANT: Record<CountStatus, "default" | "secondary" | "destructive" | "outline"> = {
  correct: "default",
  missing: "destructive",
  surplus: "secondary",
  unregistered: "outline",
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

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Conteo de Inventario"
        subtitle="Compara el conteo físico contra el stock del sistema por sucursal"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push("/admin/inventario/pedido")}>
              <PackageSearch className="mr-2 h-4 w-4" />
              Pedir stock 0
            </Button>
            {rows.length > 0 ? (
              <Button variant="outline" size="sm" onClick={downloadExport}>
                <Download className="mr-2 h-4 w-4" />
                Exportar resultado
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2 text-sm">
          {[
            { n: 1, label: "Sucursal" },
            { n: 2, label: "Archivo" },
            { n: 3, label: "Revisar" },
            { n: 4, label: "Aplicar" },
          ].map((s) => (
            <div
              key={s.n}
              className={cn(
                "rounded-full border px-3 py-1",
                step >= s.n ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground",
              )}
            >
              {s.n}. {s.label}
            </div>
          ))}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Éxito</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>1. Sucursal y periodo</CardTitle>
              <CardDescription>
                El conteo solo afecta esta sucursal. El periodo define qué altas se usan para estimar ventas en
                productos correctos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Sucursal</Label>
                <Select value={branchId} onValueChange={onBranchChange}>
                  <SelectTrigger>
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
                <Label className="mb-2 block">Periodo de altas (para correctos)</Label>
                <Select value={periodPreset} onValueChange={(v) => onPeriodPresetChange(v as PeriodPreset)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Hoy</SelectItem>
                    <SelectItem value="week">Últimos 7 días</SelectItem>
                    <SelectItem value="month">Este mes</SelectItem>
                    <SelectItem value="custom">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Desde</Label>
                    <Input
                      type="date"
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
                      value={periodEnd}
                      max={todayLocalISODate()}
                      onChange={(e) => {
                        setPeriodPreset("custom")
                        setPeriodEnd(e.target.value)
                      }}
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Como las ventas no se registran aquí (solo altas), en productos correctos se estima con las entradas
                  del periodo.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Archivo de conteo</CardTitle>
              <CardDescription>
                Con encabezado: Código de barras, Nombre, Cantidad — o sin encabezado en ese mismo orden (.csv / .xlsx / .xls)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                disabled={!branchId || comparing || applying}
                onChange={(e) => onFileSelected(e.target.files?.[0] || null)}
              />
              {fileName ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                  {fileName} · {parsedRows.length} productos
                </p>
              ) : null}
              {parseErrors.length > 0 ? (
                <div className="max-h-40 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {parseErrors.map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </div>
              ) : null}
              <Button
                onClick={runCompare}
                disabled={!branchId || parsedRows.length === 0 || comparing || !!parseErrors.length}
              >
                {comparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Comparar con stock
              </Button>
              <p className="text-xs text-muted-foreground">
                Esta acción no modifica el inventario. El stock solo cambia al aplicar el ajuste.
              </p>
            </CardContent>
          </Card>
        </div>

        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <SummaryCard
                label="Revisados"
                value={summary.reviewed}
                detail={`${qtyTotals.countedAll} piezas en el Excel`}
              />
              <SummaryCard
                label="Correctos"
                value={summary.correct}
                detail={`${qtyTotals.correctEntryUnits} pzas. altas → estimado`}
              />
              <SummaryCard
                label="Faltantes"
                value={summary.missing}
                detail={`${qtyTotals.missingUnits} piezas menos en físico`}
                tone="danger"
              />
              <SummaryCard
                label="Sobrantes"
                value={summary.surplus}
                detail={`${qtyTotals.surplusUnits} piezas de más`}
                tone="warn"
              />
              <SummaryCard
                label="No registrados"
                value={summary.unregistered}
                detail={`${qtyTotals.unregisteredUnits} pzas. (sí entran al estimado)`}
              />
            </div>

            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Estimado de ganancias</CardTitle>
                <CardDescription>
                  Faltantes + no registrados + correctos (altas del {periodStart} al {periodEnd}). Sobrantes no
                  entran. Aproximado porque las ventas no se capturan en la plataforma.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border bg-background p-4">
                    <p className="text-sm text-muted-foreground">Faltantes (sistema − conteo)</p>
                    <p className="mt-1 text-2xl font-bold text-destructive">{qtyTotals.missingUnits} pzas.</p>
                    <p className="text-sm font-medium">{formatMoney(qtyTotals.missingEarningsMxn)} MXN</p>
                  </div>
                  <div className="rounded-md border bg-background p-4">
                    <p className="text-sm text-muted-foreground">Correctos (altas del periodo)</p>
                    <p className="mt-1 text-2xl font-bold">{qtyTotals.correctEntryUnits} pzas.</p>
                    <p className="text-sm font-medium">{formatMoney(qtyTotals.correctEarningsMxn)} MXN</p>
                  </div>
                  <div className="rounded-md border bg-background p-4">
                    <p className="text-sm text-muted-foreground">No registrados</p>
                    <p className="mt-1 text-2xl font-bold">{qtyTotals.unregisteredUnits} pzas.</p>
                    <p className="text-sm font-medium">{formatMoney(qtyTotals.unregisteredEarningsMxn)} MXN</p>
                  </div>
                  <div className="rounded-md border bg-background p-4">
                    <p className="text-sm text-muted-foreground">Total piezas estimadas</p>
                    <p className="mt-1 text-2xl font-bold">{qtyTotals.soldUnitsTotal}</p>
                    <p className="text-xs text-muted-foreground">Sobrantes excluidos</p>
                  </div>
                </div>
                <div className="rounded-md border bg-background p-4">
                  <p className="text-sm text-muted-foreground">Estimado de ganancias (MXN)</p>
                  <p className="mt-1 text-3xl font-bold text-primary">
                    {formatMoney(qtyTotals.estimatedEarningsMxn)}
                    <span className="ml-2 text-base font-medium text-muted-foreground">MXN</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Utilidad aprox. (precio − costo): {formatMoney(qtyTotals.estimatedProfitMxn)} MXN
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <PackageSearch className="h-5 w-5" />
                    3. Resultados de comparación
                  </CardTitle>
                  <CardDescription>
                    Revisa las diferencias antes de aplicar. Los no registrados no se insertan automáticamente.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "Todos", qtyTotals.countedAll],
                      ["correct", "Correctos", qtyTotals.correctEntryUnits],
                      ["missing", "Faltantes", qtyTotals.missingUnits],
                      ["surplus", "Sobrantes", qtyTotals.surplusUnits],
                      ["unregistered", "No registrados", qtyTotals.unregisteredUnits],
                    ] as const
                  ).map(([key, label, units]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={filter === key ? "default" : "outline"}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                      <span className="ml-1 opacity-70">({units} pzas.)</span>
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="overflow-x-auto rounded-md border">
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
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                            Sin resultados en este filtro
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRows.map((row) => (
                          <TableRow key={row.barcode}>
                            <TableCell className="font-mono text-sm">{row.barcode}</TableCell>
                            <TableCell>
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
                            <TableCell className="text-right">{row.system_stock}</TableCell>
                            <TableCell className="text-right">{row.counted}</TableCell>
                            <TableCell className="text-right font-medium">{formatDiff(row.difference)}</TableCell>
                            <TableCell>
                              <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={reviewed}
                      onChange={(e) => {
                        setReviewed(e.target.checked)
                        if (e.target.checked) setStep(4)
                      }}
                    />
                    Ya revisé los resultados del conteo
                  </label>

                  <Button
                    disabled={!reviewed || (toUpdateCount === 0 && qtyTotals.estimatedEarningsMxn <= 0) || applying}
                    onClick={() => setConfirmOpen(true)}
                  >
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ajuste de inventario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Deseas aplicar los ajustes? Se actualizará el stock (faltantes/sobrantes) y se registrará una venta
              por el estimado de ganancias completo.
              <br />
              <br />
              Stock a modificar: <strong>{toUpdateCount}</strong> productos.
              <br />
              Venta (estimado): <strong>{formatMoney(qtyTotals.estimatedEarningsMxn)} MXN</strong> ·{" "}
              <strong>{qtyTotals.soldUnitsTotal} pzas.</strong>
              <br />
              <span className="text-muted-foreground">
                Incluye faltantes ({formatMoney(qtyTotals.missingEarningsMxn)}) + correctos/altas (
                {formatMoney(qtyTotals.correctEarningsMxn)}) + no registrados (
                {formatMoney(qtyTotals.unregisteredEarningsMxn)}).
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); applyAdjustments() }} disabled={applying}>
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar y aplicar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  valueLabel,
  detail,
  tone,
  emphasize,
}: {
  label: string
  value?: number
  valueLabel?: string
  detail?: string
  tone?: "danger" | "warn"
  emphasize?: boolean
}) {
  return (
    <Card className={cn(emphasize && "border-primary/40 bg-primary/5")}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold",
            tone === "danger" && "text-destructive",
            tone === "warn" && "text-amber-600",
          )}
        >
          {valueLabel ?? value}
        </p>
        {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}
