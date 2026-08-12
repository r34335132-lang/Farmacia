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

  const applyAdjustments = async () => {
    setApplying(true)
    setError("")
    setSuccess("")
    try {
      const applyItems = rows
        .filter((r) => r.status === "missing" || r.status === "surplus")
        .map((r) => ({ barcode: r.barcode, name: r.product_name, quantity: r.counted }))

      const res = await fetch("/api/inventory/count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          branch_id: branchId,
          items: applyItems,
          apply_items: applyItems,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "No se pudieron aplicar los ajustes")
        return
      }

      const updated = json.result?.updated ?? 0
      setSuccess(`Ajuste aplicado correctamente. Se modificaron ${updated} productos.`)
      setStep(4)
      setConfirmOpen(false)

      // Recomparar para reflejar stock actualizado
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
          rows.length > 0 ? (
            <Button variant="outline" size="sm" onClick={downloadExport}>
              <Download className="mr-2 h-4 w-4" />
              Exportar resultado
            </Button>
          ) : null
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
              <CardTitle>1. Sucursal</CardTitle>
              <CardDescription>El conteo solo afecta productos de esta sucursal (barcode + branch_id).</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Archivo de conteo</CardTitle>
              <CardDescription>Columnas: Código de barras, Nombre, Cantidad (.csv / .xlsx / .xls)</CardDescription>
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
              <SummaryCard label="Productos revisados" value={summary.reviewed} />
              <SummaryCard label="Correctos" value={summary.correct} />
              <SummaryCard label="Faltantes" value={summary.missing} tone="danger" />
              <SummaryCard label="Sobrantes" value={summary.surplus} tone="warn" />
              <SummaryCard label="No registrados" value={summary.unregistered} />
            </div>

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
                      ["all", "Todos"],
                      ["correct", "Correctos"],
                      ["missing", "Faltantes"],
                      ["surplus", "Sobrantes"],
                      ["unregistered", "No registrados"],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={filter === key ? "default" : "outline"}
                      onClick={() => setFilter(key)}
                    >
                      {label}
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
                    disabled={!reviewed || toUpdateCount === 0 || applying}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Aplicar ajuste de inventario
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
              ¿Deseas aplicar los ajustes de inventario? Esta acción modificará el stock de los productos
              seleccionados.
              <br />
              <br />
              Se modificarán <strong>{toUpdateCount}</strong> productos (faltantes y sobrantes). Los productos no
              registrados no se crearán. Los eliminados/inactivos no se modifican.
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
  tone,
}: {
  label: string
  value: number
  tone?: "danger" | "warn"
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold",
            tone === "danger" && "text-destructive",
            tone === "warn" && "text-amber-600",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
