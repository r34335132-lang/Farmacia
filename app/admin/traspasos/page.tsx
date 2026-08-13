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
import { CheckCircle2, ArrowRightLeft, FileSpreadsheet, Loader2, Upload } from "lucide-react"
import { parseInventoryTransferFile, type TransferFileRow } from "@/lib/inventory-transfer"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

type TransferStatus = "ready" | "will_create" | "insufficient" | "missing_origin" | "no_barcode"
type FilterKey = "all" | TransferStatus

type TransferRow = {
  barcode: string
  file_name?: string | null
  quantity: number
  status: TransferStatus
  origin_stock: number
  dest_stock: number
  origin_product_id?: string | null
  dest_product_id?: string | null
  product_name: string
  unit_cost?: number
  unit_price?: number
  message?: string
}

type TransferSummary = {
  reviewed: number
  ready: number
  insufficient: number
  missing_origin: number
  will_create: number
  transferable: number
}

const STATUS_LABEL: Record<TransferStatus, string> = {
  ready: "Listo",
  will_create: "Se creará en destino",
  insufficient: "Stock insuficiente",
  missing_origin: "No está en origen",
  no_barcode: "Sin código",
}

const STATUS_VARIANT: Record<TransferStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ready: "default",
  will_create: "secondary",
  insufficient: "destructive",
  missing_origin: "outline",
  no_barcode: "outline",
}

export default function AdminTraspasosPage() {
  const router = useRouter()
  const supabase = createClient()

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [fromBranchId, setFromBranchId] = useState("")
  const [toBranchId, setToBranchId] = useState("")
  const [fileName, setFileName] = useState("")
  const [parsedRows, setParsedRows] = useState<TransferFileRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rows, setRows] = useState<TransferRow[]>([])
  const [summary, setSummary] = useState<TransferSummary | null>(null)
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
    const parsed = await parseInventoryTransferFile(file)
    if (!parsed.ok) {
      setParseErrors(parsed.errors)
      return
    }
    setParsedRows(parsed.rows)
  }

  const runPreview = async () => {
    setError("")
    setSuccess("")
    if (!fromBranchId || !toBranchId) {
      setError("Selecciona sucursal origen y destino")
      return
    }
    if (fromBranchId === toBranchId) {
      setError("Origen y destino deben ser distintas")
      return
    }
    if (parsedRows.length === 0) {
      setError("Sube un Excel/CSV válido")
      return
    }

    setPreviewing(true)
    try {
      const res = await fetch("/api/inventory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          from_branch_id: fromBranchId,
          to_branch_id: toBranchId,
          items: parsedRows,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "No se pudo revisar el traspaso")
        return
      }
      setRows((json.result?.rows || []) as TransferRow[])
      setSummary(json.result?.summary || null)
      setReviewed(false)
    } catch {
      setError("Error de red al revisar el traspaso")
    } finally {
      setPreviewing(false)
    }
  }

  const transferableRows = useMemo(
    () => rows.filter((r) => r.status === "ready" || r.status === "will_create"),
    [rows],
  )

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const totals = useMemo(() => {
    let units = 0
    let cost = 0
    for (const row of transferableRows) {
      units += row.quantity
      cost += row.quantity * (Number(row.unit_cost) || 0)
    }
    return { units, cost }
  }, [transferableRows])

  const applyTransfer = async () => {
    setApplying(true)
    setError("")
    setSuccess("")
    try {
      const applyItems = transferableRows.map((r) => ({
        barcode: r.barcode,
        name: r.product_name,
        quantity: r.quantity,
      }))

      if (applyItems.length === 0) {
        setError("No hay filas listas para transferir")
        return
      }

      const res = await fetch("/api/inventory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply",
          from_branch_id: fromBranchId,
          to_branch_id: toBranchId,
          items: applyItems,
          apply_items: applyItems,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "No se pudo aplicar el traspaso")
        return
      }

      const transferred = json.result?.transferred ?? 0
      const created = json.result?.created ?? 0
      const units = json.result?.units ?? 0
      setSuccess(
        `Traspaso aplicado: ${transferred} productos (${units} pzas.). Altas en destino: ${created}.`,
      )
      setConfirmOpen(false)
      await runPreview()
      setReviewed(true)
    } catch {
      setError("Error de red al aplicar el traspaso")
    } finally {
      setApplying(false)
    }
  }

  const fromName = branches.find((b) => b.id === fromBranchId)?.name || "Origen"
  const toName = branches.find((b) => b.id === toBranchId)?.name || "Destino"

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Traspaso de Inventario"
        subtitle="Pasa productos de una sucursal a otra con Excel/CSV"
      />

      <div className="space-y-6 p-4 sm:p-6">
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
              <CardTitle>1. Sucursales</CardTitle>
              <CardDescription>Se resta del origen y se suma al destino (crea el producto si no existe).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Origen</Label>
                <Select
                  value={fromBranchId}
                  onValueChange={(v) => {
                    setFromBranchId(v)
                    resetResults()
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sucursal origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} disabled={b.id === toBranchId}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-center text-muted-foreground">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div>
                <Label className="mb-2 block">Destino</Label>
                <Select
                  value={toBranchId}
                  onValueChange={(v) => {
                    setToBranchId(v)
                    resetResults()
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sucursal destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} disabled={b.id === fromBranchId}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>2. Archivo de traspaso</CardTitle>
              <CardDescription>
                Columnas: Código / Descripción / Cantidad (también acepta MOT, como tu Excel Camioneta→Moto)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                disabled={!fromBranchId || !toBranchId || previewing || applying}
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
                onClick={runPreview}
                disabled={
                  !fromBranchId ||
                  !toBranchId ||
                  parsedRows.length === 0 ||
                  previewing ||
                  !!parseErrors.length
                }
              >
                {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Revisar traspaso
              </Button>
            </CardContent>
          </Card>
        </div>

        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <SummaryCard label="Revisados" value={summary.reviewed} />
              <SummaryCard label="Listos" value={summary.ready - (summary.will_create || 0)} />
              <SummaryCard label="Se crearán" value={summary.will_create} tone="warn" />
              <SummaryCard label="Sin stock" value={summary.insufficient} tone="danger" />
              <SummaryCard label="No en origen" value={summary.missing_origin} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Resumen: {fromName} → {toName}
                </CardTitle>
                <CardDescription>
                  Se transferirán {transferableRows.length} productos · {totals.units} pzas. · costo aprox.{" "}
                  {formatMoney(totals.cost)} MXN
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>3. Revisar y aplicar</CardTitle>
                  <CardDescription>Solo se mueven filas Listo / Se creará. Las demás se omiten.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "Todos"],
                      ["ready", "Listos"],
                      ["will_create", "Se crearán"],
                      ["insufficient", "Sin stock"],
                      ["missing_origin", "No en origen"],
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
                        <TableHead>Código</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Stock origen</TableHead>
                        <TableHead className="text-right">Stock destino</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                            Sin resultados
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRows.map((row, idx) => (
                          <TableRow key={`${row.barcode || "x"}-${idx}`}>
                            <TableCell className="font-mono text-sm">{row.barcode || "—"}</TableCell>
                            <TableCell>
                              <p className="font-medium">{row.product_name}</p>
                              {row.message ? (
                                <p className="text-xs text-muted-foreground">{row.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">{row.quantity}</TableCell>
                            <TableCell className="text-right">{row.origin_stock}</TableCell>
                            <TableCell className="text-right">{row.dest_stock}</TableCell>
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
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    Ya revisé el traspaso
                  </label>
                  <Button
                    disabled={!reviewed || transferableRows.length === 0 || applying}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Aplicar traspaso
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar traspaso</AlertDialogTitle>
            <AlertDialogDescription>
              Se moverán <strong>{transferableRows.length}</strong> productos (
              <strong>{totals.units}</strong> pzas.) de <strong>{fromName}</strong> a <strong>{toName}</strong>.
              <br />
              <br />
              Se restará stock en origen y se sumará en destino. Si el producto no existe en destino, se creará.
              Esta acción no se puede deshacer automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={applying}
              onClick={(e) => {
                e.preventDefault()
                applyTransfer()
              }}
            >
              {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar traspaso
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
