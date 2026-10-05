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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  FileSpreadsheet,
  ListChecks,
  Loader2,
  Minus,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react"
import { parseInventoryTransferFile, type TransferFileRow } from "@/lib/inventory-transfer"
import { formatMoney } from "@/lib/money"
import { cn } from "@/lib/utils"

type TransferStatus = "ready" | "will_create" | "insufficient" | "missing_origin" | "no_barcode"
type FilterKey = "all" | TransferStatus
type Mode = "manual" | "excel"

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
  dest_price?: number | null
  dest_cost?: number | null
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

type PickProduct = {
  id: string
  name: string
  barcode: string | null
  stock_quantity: number
  price: number
}

type SelectedItem = {
  barcode: string
  name: string
  stock: number
  quantity: string
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

const isTransferable = (row: TransferRow) => row.status === "ready" || row.status === "will_create"

const defaultDestPrice = (row: TransferRow) =>
  row.dest_price != null ? Number(row.dest_price) : Number(row.unit_price) || 0

export default function AdminTraspasosPage() {
  const router = useRouter()
  const supabase = createClient()

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [fromBranchId, setFromBranchId] = useState("")
  const [toBranchId, setToBranchId] = useState("")
  const [mode, setMode] = useState<Mode>("manual")

  const [fileName, setFileName] = useState("")
  const [parsedRows, setParsedRows] = useState<TransferFileRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])

  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<PickProduct[]>([])
  const [searchError, setSearchError] = useState("")
  const [selected, setSelected] = useState<SelectedItem[]>([])

  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [rows, setRows] = useState<TransferRow[]>([])
  const [destPrices, setDestPrices] = useState<Record<string, string>>({})
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
    setDestPrices({})
    setSummary(null)
    setReviewed(false)
    setSuccess("")
    setFilter("all")
  }

  useEffect(() => {
    if (mode !== "manual" || !fromBranchId) return
    const q = search.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearchError("")
      setSearching(false)
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `/api/products/lookup?branch_id=${encodeURIComponent(fromBranchId)}&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        )
        const json = await res.json()
        if (!res.ok) {
          setSearchResults([])
          setSearchError(json.error || "Sin resultados")
          return
        }
        setSearchResults((json.products || []) as PickProduct[])
        setSearchError("")
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSearchError("Error de red al buscar")
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [search, fromBranchId, mode])

  const addProduct = (product: PickProduct) => {
    const barcode = (product.barcode || "").trim()
    if (!barcode) return
    setSelected((prev) => {
      const existing = prev.find((item) => item.barcode === barcode)
      if (existing) {
        return prev.map((item) =>
          item.barcode === barcode
            ? { ...item, quantity: String((Number.parseInt(item.quantity, 10) || 0) + 1) }
            : item,
        )
      }
      return [
        ...prev,
        { barcode, name: product.name, stock: Number(product.stock_quantity) || 0, quantity: "1" },
      ]
    })
    resetResults()
  }

  const updateSelectedQty = (barcode: string, quantity: string) => {
    setSelected((prev) => prev.map((item) => (item.barcode === barcode ? { ...item, quantity } : item)))
    resetResults()
  }

  const stepSelectedQty = (barcode: string, delta: number) => {
    setSelected((prev) =>
      prev.map((item) =>
        item.barcode === barcode
          ? { ...item, quantity: String(Math.max(1, (Number.parseInt(item.quantity, 10) || 0) + delta)) }
          : item,
      ),
    )
    resetResults()
  }

  const removeSelected = (barcode: string) => {
    setSelected((prev) => prev.filter((item) => item.barcode !== barcode))
    resetResults()
  }

  const onSearchEnter = async () => {
    const q = search.trim()
    if (!q || !fromBranchId) return
    const exact = searchResults.find((p) => (p.barcode || "").trim() === q)
    if (exact) {
      addProduct(exact)
      setSearch("")
      return
    }
    if (/^\d{4,}$/.test(q)) {
      try {
        const res = await fetch(
          `/api/products/lookup?branch_id=${encodeURIComponent(fromBranchId)}&barcode=${encodeURIComponent(q)}`,
        )
        const json = await res.json()
        if (res.ok && json.product) {
          addProduct(json.product as PickProduct)
          setSearch("")
          return
        }
      } catch {
        // cae al mensaje de abajo
      }
      setSearchError("Ese código no existe en la sucursal origen")
      return
    }
    if (searchResults.length === 1) {
      addProduct(searchResults[0])
      setSearch("")
    }
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

  const manualInvalid = useMemo(
    () =>
      selected.some((item) => {
        const qty = Number(item.quantity)
        return !Number.isInteger(qty) || qty <= 0
      }),
    [selected],
  )

  const sourceItems = useMemo<TransferFileRow[]>(() => {
    if (mode === "excel") return parsedRows
    return selected.map((item) => ({
      barcode: item.barcode,
      name: item.name,
      quantity: Number(item.quantity),
    }))
  }, [mode, parsedRows, selected])

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
    if (sourceItems.length === 0) {
      setError(mode === "excel" ? "Sube un Excel/CSV válido" : "Agrega al menos un producto")
      return
    }
    if (mode === "manual" && manualInvalid) {
      setError("Revisa las cantidades: deben ser números enteros mayores a 0")
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
          items: sourceItems,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "No se pudo revisar el traspaso")
        return
      }
      const nextRows = (json.result?.rows || []) as TransferRow[]
      setRows(nextRows)
      setDestPrices(
        Object.fromEntries(
          nextRows.filter(isTransferable).map((row) => [row.barcode, defaultDestPrice(row).toFixed(2)]),
        ),
      )
      setSummary(json.result?.summary || null)
      setReviewed(false)
    } catch {
      setError("Error de red al revisar el traspaso")
    } finally {
      setPreviewing(false)
    }
  }

  const transferableRows = useMemo(() => rows.filter(isTransferable), [rows])

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows
    return rows.filter((r) => r.status === filter)
  }, [rows, filter])

  const invalidPrices = useMemo(
    () =>
      transferableRows.some((row) => {
        const raw = destPrices[row.barcode]
        const value = Number(raw)
        return raw == null || raw.trim() === "" || !Number.isFinite(value) || value < 0
      }),
    [transferableRows, destPrices],
  )

  const changedPrices = useMemo(
    () =>
      transferableRows.filter((row) => {
        if (row.dest_price == null) return false
        return Math.abs(Number(destPrices[row.barcode]) - Number(row.dest_price)) >= 0.005
      }).length,
    [transferableRows, destPrices],
  )

  const totals = useMemo(() => {
    let units = 0
    let cost = 0
    let destValue = 0
    for (const row of transferableRows) {
      units += row.quantity
      cost += row.quantity * (Number(row.unit_cost) || 0)
      destValue += row.quantity * (Number(destPrices[row.barcode]) || 0)
    }
    return { units, cost, destValue }
  }, [transferableRows, destPrices])

  const setAllPrices = (source: "dest" | "origin") => {
    setDestPrices(
      Object.fromEntries(
        transferableRows.map((row) => [
          row.barcode,
          (source === "origin" ? Number(row.unit_price) || 0 : defaultDestPrice(row)).toFixed(2),
        ]),
      ),
    )
  }

  const applyTransfer = async () => {
    setApplying(true)
    setError("")
    setSuccess("")
    try {
      if (invalidPrices) {
        setError("Hay precios de destino inválidos")
        return
      }

      const applyItems = transferableRows.map((r) => ({
        barcode: r.barcode,
        name: r.product_name,
        quantity: r.quantity,
        price: Math.round(Number(destPrices[r.barcode]) * 100) / 100,
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
  const branchesReady = !!fromBranchId && !!toBranchId && fromBranchId !== toBranchId
  const selectedUnits = selected.reduce((acc, item) => acc + (Number.parseInt(item.quantity, 10) || 0), 0)

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Traspaso de Inventario"
        subtitle="Pasa productos de una sucursal a otra eligiéndolos o con Excel/CSV"
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>1. Sucursales</CardTitle>
              <CardDescription>
                Se resta del origen y se suma al destino. El precio en destino lo apruebas antes de aplicar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Origen (de dónde sale)</Label>
                <Select
                  value={fromBranchId}
                  onValueChange={(v) => {
                    setFromBranchId(v)
                    setSelected([])
                    setSearch("")
                    setSearchResults([])
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
                <Label className="mb-2 block">Destino (a dónde llega)</Label>
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
            <CardHeader className="gap-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>2. Productos a traspasar</CardTitle>
                  <CardDescription>
                    {mode === "manual"
                      ? `Busca por nombre o escanea el código en ${fromBranchId ? fromName : "la sucursal origen"}`
                      : "Columnas: Código / Descripción / Cantidad (también acepta MOT, como tu Excel Camioneta→Moto)"}
                  </CardDescription>
                </div>
                <Tabs
                  value={mode}
                  onValueChange={(v) => {
                    setMode(v as Mode)
                    resetResults()
                    setError("")
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="manual" className="gap-1.5">
                      <ListChecks className="h-4 w-4" />
                      Seleccionar
                    </TabsTrigger>
                    <TabsTrigger value="excel" className="gap-1.5">
                      <FileSpreadsheet className="h-4 w-4" />
                      Excel
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {mode === "manual" ? (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value)
                        setSearchError("")
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          onSearchEnter()
                        }
                      }}
                      disabled={!branchesReady || previewing || applying}
                      placeholder={
                        branchesReady ? "Nombre o código de barras (Enter para agregar)" : "Primero elige origen y destino"
                      }
                      className="pl-9 pr-9"
                    />
                    {searching ? (
                      <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>

                  {searchError && search.trim().length >= 2 ? (
                    <p className="text-sm text-muted-foreground">{searchError}</p>
                  ) : null}

                  {searchResults.length > 0 && search.trim().length >= 2 ? (
                    <div className="max-h-64 divide-y overflow-auto rounded-md border">
                      {searchResults.map((product) => {
                        const hasBarcode = !!(product.barcode || "").trim()
                        const already = selected.find((item) => item.barcode === (product.barcode || "").trim())
                        return (
                          <button
                            key={product.id}
                            type="button"
                            disabled={!hasBarcode}
                            onClick={() => addProduct(product)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                              <Package className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{product.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {hasBarcode ? product.barcode : "Sin código (no se puede traspasar)"}
                              </p>
                            </div>
                            <div className="text-right text-xs">
                              <p
                                className={cn(
                                  "font-semibold",
                                  Number(product.stock_quantity) <= 0 && "text-destructive",
                                )}
                              >
                                {Number(product.stock_quantity) || 0} pzas.
                              </p>
                              <p className="text-muted-foreground">{formatMoney(product.price)}</p>
                            </div>
                            {hasBarcode ? (
                              <span
                                className={cn(
                                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                                  already ? "bg-primary text-primary-foreground" : "bg-muted",
                                )}
                              >
                                <Plus className="h-4 w-4" />
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}

                  <div className="rounded-md border">
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <p className="text-sm font-semibold">
                        Seleccionados{" "}
                        <span className="font-normal text-muted-foreground">
                          · {selected.length} productos · {selectedUnits} pzas.
                        </span>
                      </p>
                      {selected.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelected([])
                            resetResults()
                          }}
                        >
                          Limpiar
                        </Button>
                      ) : null}
                    </div>
                    {selected.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        Aún no agregas productos
                      </p>
                    ) : (
                      <div className="max-h-80 divide-y overflow-auto">
                        {selected.map((item) => {
                          const qty = Number(item.quantity)
                          const over = Number.isFinite(qty) && qty > item.stock
                          return (
                            <div key={item.barcode} className="flex flex-wrap items-center gap-3 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{item.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  <span className="font-mono">{item.barcode}</span> · Disponible: {item.stock}
                                </p>
                                {over ? (
                                  <p className="text-xs font-medium text-destructive">
                                    Pides más de lo que hay en origen
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => stepSelectedQty(item.barcode, -1)}
                                >
                                  <Minus className="h-3.5 w-3.5" />
                                </Button>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1}
                                  value={item.quantity}
                                  onChange={(e) => updateSelectedQty(item.barcode, e.target.value)}
                                  className={cn("h-8 w-16 text-center", over && "border-destructive")}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => stepSelectedQty(item.barcode, 1)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => removeSelected(item.barcode)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    disabled={!branchesReady || previewing || applying}
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
                </>
              )}

              <Button
                onClick={runPreview}
                disabled={
                  !branchesReady ||
                  sourceItems.length === 0 ||
                  previewing ||
                  (mode === "excel" && !!parseErrors.length) ||
                  (mode === "manual" && manualInvalid)
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
                  {formatMoney(totals.cost)} · valor de venta en {toName}: {formatMoney(totals.destValue)}
                  {changedPrices > 0 ? ` · ${changedPrices} precios cambian en destino` : ""}
                </CardDescription>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>3. Revisar, ajustar precio y aprobar</CardTitle>
                  <CardDescription>
                    Solo se mueven filas Listo / Se creará. El precio en destino arranca con el que ya tiene{" "}
                    {toName} (o el de {fromName} si se crea).
                  </CardDescription>
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
                {transferableRows.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Precios en destino:</span>
                    <Button size="sm" variant="outline" onClick={() => setAllPrices("dest")}>
                      Mantener los de {toName}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAllPrices("origin")}>
                      Copiar los de {fromName}
                    </Button>
                  </div>
                ) : null}

                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Stock {fromName}</TableHead>
                        <TableHead className="text-right">Stock {toName}</TableHead>
                        <TableHead className="text-right">Precio {fromName}</TableHead>
                        <TableHead className="min-w-[140px] text-right">Precio en {toName}</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                            Sin resultados
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRows.map((row, idx) => {
                          const movable = isTransferable(row)
                          const priceValue = destPrices[row.barcode] ?? ""
                          const priceNum = Number(priceValue)
                          const priceBad =
                            movable && (priceValue.trim() === "" || !Number.isFinite(priceNum) || priceNum < 0)
                          const priceChanged =
                            movable &&
                            row.dest_price != null &&
                            !priceBad &&
                            Math.abs(priceNum - Number(row.dest_price)) >= 0.005
                          return (
                            <TableRow key={`${row.barcode || "x"}-${idx}`}>
                              <TableCell className="font-mono text-sm">{row.barcode || "—"}</TableCell>
                              <TableCell>
                                <p className="font-medium">{row.product_name}</p>
                                {row.message ? (
                                  <p className="text-xs text-muted-foreground">{row.message}</p>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-right font-semibold">{row.quantity}</TableCell>
                              <TableCell className="text-right">
                                <StockChange
                                  before={row.origin_stock}
                                  after={movable ? row.origin_stock - row.quantity : null}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <StockChange
                                  before={row.dest_stock}
                                  after={movable ? row.dest_stock + row.quantity : null}
                                  positive
                                />
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {row.status === "missing_origin" || row.status === "no_barcode"
                                  ? "—"
                                  : formatMoney(row.unit_price)}
                              </TableCell>
                              <TableCell className="text-right">
                                {movable ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="relative w-28">
                                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                        $
                                      </span>
                                      <Input
                                        type="number"
                                        inputMode="decimal"
                                        min={0}
                                        step="0.01"
                                        value={priceValue}
                                        onChange={(e) =>
                                          setDestPrices((prev) => ({ ...prev, [row.barcode]: e.target.value }))
                                        }
                                        className={cn(
                                          "h-8 pl-5 text-right",
                                          priceBad && "border-destructive",
                                          priceChanged && "border-amber-500",
                                        )}
                                      />
                                    </div>
                                    <span className="text-[11px] text-muted-foreground">
                                      {row.dest_price != null
                                        ? priceChanged
                                          ? `Antes ${formatMoney(row.dest_price)}`
                                          : `Actual en ${toName}`
                                        : "Nuevo en destino"}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {row.dest_price != null ? formatMoney(row.dest_price) : "—"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                              </TableCell>
                            </TableRow>
                          )
                        })
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
                    Ya revisé cantidades, stock y precios
                  </label>
                  <Button
                    disabled={!reviewed || transferableRows.length === 0 || applying || invalidPrices}
                    onClick={() => setConfirmOpen(true)}
                  >
                    Aprobar traspaso
                  </Button>
                </div>
                {invalidPrices ? (
                  <p className="text-sm text-destructive">Corrige los precios marcados en rojo para continuar.</p>
                ) : null}
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
              Se restará stock en {fromName} y se sumará en {toName} con el precio que aprobaste para {toName}
              {changedPrices > 0 ? ` (${changedPrices} precios cambian)` : ""}. Si el producto no existe en destino, se
              creará. Esta acción no se puede deshacer automáticamente.
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

function StockChange({
  before,
  after,
  positive,
}: {
  before: number
  after: number | null
  positive?: boolean
}) {
  if (after == null) return <span>{before}</span>
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-muted-foreground">{before}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className={cn("font-semibold", positive ? "text-emerald-600" : "text-primary")}>{after}</span>
    </span>
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
