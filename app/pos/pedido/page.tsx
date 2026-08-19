"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Minus,
  Plus,
  Search,
  Store,
  Trash2,
  Download,
  Printer,
  PackagePlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  buildSupplyRequestDocumentHtml,
  downloadSupplyRequestDocument,
  openSupplyRequestDocument,
  type BuyListItem,
} from "@/lib/supply-request-document"

type BranchInfo = { id: string; name: string }

type Product = {
  id: string
  name: string
  barcode?: string | null
  image_url?: string | null
  stock_quantity?: number
  min_stock_level?: number
  is_active?: boolean
}

type DraftItem = {
  key: string
  product_id?: string | null
  product_name: string
  barcode?: string | null
  quantity: number
  photo_url?: string | null
}

function branchQuery(branchId?: string | null) {
  return branchId ? `?branch_id=${branchId}` : ""
}

async function uploadPhoto(file: File) {
  const filename = `pedidos-caja/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "")}`
  const res = await fetch(`/api/upload?filename=${encodeURIComponent(filename)}`, {
    method: "POST",
    body: file,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || "No se pudo subir la foto")
  return data.url as string
}

export default function PedidoCajaPage() {
  const router = useRouter()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const customPhotoRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branch, setBranch] = useState<BranchInfo | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [items, setItems] = useState<DraftItem[]>([])
  const [selected, setSelected] = useState<Product | "custom" | null>(null)
  const [qty, setQty] = useState(1)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [customName, setCustomName] = useState("")
  const [done, setDone] = useState<{ number: string; items: BuyListItem[] } | null>(null)
  const [buyList, setBuyList] = useState<BuyListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [quickOrderingId, setQuickOrderingId] = useState<string | null>(null)
  const [quickOrderNotice, setQuickOrderNotice] = useState<{
    productName: string
    requestNumber: string
    quantity: number
  } | null>(null)

  const suggestedOrderQty = (product: Product) => {
    const stock = product.stock_quantity ?? 0
    const min = product.min_stock_level ?? 10
    return Math.max(1, min - stock)
  }

  const isLowStock = (product: Product) =>
    (product.stock_quantity ?? 0) <= (product.min_stock_level ?? 10)

  const quickSubmitProduct = async (product: Product) => {
    if (!branch) {
      setError("Elige la sucursal")
      return
    }

    const qty = suggestedOrderQty(product)
    setQuickOrderingId(product.id)
    setError(null)
    try {
      const res = await fetch("/api/supply-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branch.id,
          items: [
            {
              product_id: product.id,
              product_name: product.name,
              barcode: product.barcode || null,
              quantity: qty,
              photo_url: product.image_url || null,
            },
          ],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el pedido")

      setQuickOrderNotice({
        productName: product.name,
        requestNumber: data.request?.request_number || "Pedido",
        quantity: qty,
      })
      window.setTimeout(() => setQuickOrderNotice(null), 4500)
      await loadBuyList()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el pedido")
    } finally {
      setQuickOrderingId(null)
    }
  }

  const loadBuyList = useCallback(async () => {
    const res = await fetch("/api/supply-requests/buy-list")
    const data = await res.json().catch(() => ({}))
    if (res.ok) setBuyList(data.items || [])
  }, [])

  useEffect(() => {
    const boot = async () => {
      try {
        const branchRes = await fetch("/api/branches")
        const branchData = await branchRes.json()
        if (!branchRes.ok) throw new Error(branchData.error || "No se pudo cargar la sucursal")

        setIsAdmin(Boolean(branchData.isAdmin))
        setBranches(branchData.branches || [])

        if (branchData.isAdmin) {
          const saved = sessionStorage.getItem("pos_admin_branch_id")
          const match = (branchData.branches || []).find((b: BranchInfo) => b.id === saved)
          if (match) setBranch(match)
        } else if (branchData.activeBranch) {
          setBranch(branchData.activeBranch)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar")
      } finally {
        setLoading(false)
      }
    }
    boot()
    loadBuyList()
  }, [loadBuyList])

  useEffect(() => {
    if (!branch) return
    const loadProducts = async () => {
      const res = await fetch(`/api/products${branchQuery(branch.id)}`)
      const data = await res.json().catch(() => ({}))
      const list = ((data.products || []) as Product[]).filter((p) => p.is_active !== false)
      setProducts(list)
    }
    loadProducts()
  }, [branch])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return products
      .filter((p) => {
        const name = p.name.toLowerCase()
        const barcode = (p.barcode || "").toLowerCase()
        return name.includes(q) || barcode.includes(q)
      })
      .slice(0, 12)
  }, [products, search])

  const pickProduct = (product: Product | "custom") => {
    setSelected(product)
    setQty(1)
    setPhotoUrl(product === "custom" ? null : product.image_url || null)
    setCustomName("")
    setError(null)
  }

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return
    setUploadingPhoto(true)
    setError(null)
    try {
      const url = await uploadPhoto(file)
      setPhotoUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto")
    } finally {
      setUploadingPhoto(false)
    }
  }

  const addItem = () => {
    const name = selected === "custom" ? customName.trim() : selected?.name.trim()
    if (!name) {
      setError("Escribe el nombre de lo que se ocupa")
      return
    }
    if (qty < 1) {
      setError("Pon cuántas piezas se ocupan")
      return
    }

    const barcode = selected === "custom" ? null : selected?.barcode || null
    const productId = selected === "custom" ? null : selected?.id
    const key = `${productId || name.toLowerCase()}-${barcode || "s/c"}`

    setItems((current) => {
      const existing = current.find((item) => item.key === key)
      if (existing) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity: item.quantity + qty,
                photo_url: photoUrl || item.photo_url,
              }
            : item,
        )
      }
      return [
        ...current,
        {
          key,
          product_id: productId,
          product_name: name,
          barcode,
          quantity: qty,
          photo_url: photoUrl,
        },
      ]
    })
    setSelected(null)
    setSearch("")
    setQty(1)
    setPhotoUrl(null)
    setCustomName("")
    setError(null)
  }

  const submit = async () => {
    if (!branch) {
      setError("Elige la sucursal")
      return
    }
    if (items.length === 0) {
      setError("Agrega por lo menos una cosa a la lista")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/supply-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branch.id,
          items: items.map((item) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            barcode: item.barcode,
            quantity: item.quantity,
            photo_url: item.photo_url,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo guardar")

      const savedItems: BuyListItem[] = items.map((item) => ({
        product_name: item.product_name,
        barcode: item.barcode,
        photo_url: item.photo_url,
        total: item.quantity,
        branches: [{ branch_id: branch.id, branch_name: branch.name, quantity: item.quantity }],
      }))
      setDone({ number: data.request?.request_number || "Pedido", items: savedItems })
      await loadBuyList()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el pedido")
    } finally {
      setSaving(false)
    }
  }

  const printList = (list: BuyListItem[], title: string, subtitle: string) => {
    const html = buildSupplyRequestDocumentHtml({ title, subtitle, items: list })
    if (!openSupplyRequestDocument(html)) {
      downloadSupplyRequestDocument(html, `${title.replace(/\s+/g, "-").toLowerCase()}.html`)
    }
  }

  const downloadList = (list: BuyListItem[], title: string, subtitle: string, filename: string) => {
    const html = buildSupplyRequestDocumentHtml({ title, subtitle, items: list })
    downloadSupplyRequestDocument(html, filename)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rose-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-800 border-t-transparent" />
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen bg-emerald-50 px-4 py-8">
        <div className="mx-auto max-w-xl space-y-6 text-center">
          <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-600" />
          <h1 className="text-4xl font-black text-emerald-800">¡Listo!</h1>
          <p className="text-xl text-emerald-900">
            Pedido {done.number} de <strong>{branch?.name}</strong> ya quedó guardado.
          </p>
          <div className="grid gap-3">
            <Button
              className="h-16 text-xl font-black bg-emerald-700 hover:bg-emerald-800"
              onClick={() =>
                printList(
                  buyList.length ? buyList : done.items,
                  "Lista para comprar",
                  "Cantidad por sucursal",
                )
              }
            >
              <Printer className="mr-3 h-7 w-7" />
              Imprimir lista de compra
            </Button>
            <Button
              variant="outline"
              className="h-16 text-xl font-black border-2"
              onClick={() =>
                downloadList(
                  buyList.length ? buyList : done.items,
                  "Lista para comprar",
                  "Cantidad por sucursal",
                  `lista-compra-${new Date().toISOString().slice(0, 10)}.html`,
                )
              }
            >
              <Download className="mr-3 h-7 w-7" />
              Descargar lista
            </Button>
            <Button
              variant="ghost"
              className="h-14 text-lg"
              onClick={() => printList(done.items, `Pedido ${done.number}`, branch?.name || "")}
            >
              Ver solo esta sucursal
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Si te pide imprimir, elige “Guardar como PDF” para tener el archivo.
          </p>
          <div className="flex flex-col gap-2">
            <Button
              className="h-14 text-lg"
              onClick={() => {
                setDone(null)
                setItems([])
              }}
            >
              Hacer otro pedido
            </Button>
            <Button variant="outline" className="h-14 text-lg" onClick={() => router.push("/pos")}>
              Volver a cobrar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (isAdmin && !branch) {
    return (
      <div className="min-h-screen bg-rose-50 px-4 py-8">
        <div className="mx-auto max-w-xl space-y-6">
          <Button variant="ghost" onClick={() => router.push("/pos")}>
            <ArrowLeft className="mr-2 h-5 w-5" /> Volver al cobro
          </Button>
          <h1 className="text-3xl font-black">¿De qué sucursal es el pedido?</h1>
          <p className="text-lg text-muted-foreground">Toca la sucursal. Nada más.</p>
          <div className="grid gap-3">
            {branches.map((item) => (
              <Button
                key={item.id}
                className="h-20 justify-start text-xl font-bold bg-white text-rose-900 border-2 border-rose-200 hover:bg-rose-100"
                variant="outline"
                onClick={() => {
                  setBranch(item)
                  sessionStorage.setItem("pos_admin_branch_id", item.id)
                }}
              >
                <Store className="mr-3 h-7 w-7" />
                {item.name}
              </Button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-rose-50 pb-36">
      <header className="sticky top-0 z-20 border-b bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button variant="ghost" size="lg" onClick={() => router.push("/pos")}>
            <ArrowLeft className="mr-2 h-5 w-5" />
            Cobrar
          </Button>
          <div className="min-w-0 text-right">
            <p className="text-xs uppercase tracking-widest text-rose-800">Pedir mercancía</p>
            <p className="truncate text-lg font-black">{branch?.name || "Sucursal"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-5">
        {quickOrderNotice && (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
            <div>
              <p className="text-lg font-black text-emerald-900">¡Pedido enviado!</p>
              <p className="text-emerald-800">
                {quickOrderNotice.quantity} pza de <strong>{quickOrderNotice.productName}</strong> ·{" "}
                {quickOrderNotice.requestNumber}
              </p>
            </div>
          </div>
        )}

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h1 className="text-3xl font-black">¿Qué se ocupó?</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            Busca el producto, pon cuántos y listo. La foto es opcional.
          </p>
          <div className="relative mt-4">
            <Search className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSelected(null)
              }}
              placeholder="Escribe el nombre o el código"
              className="h-16 rounded-2xl pl-14 text-xl"
            />
          </div>

          {search.trim().length >= 2 && (
            <div className="mt-3 space-y-2">
              {results.map((product) => {
                const stock = product.stock_quantity ?? 0
                const outOfStock = stock === 0
                const lowStock = isLowStock(product)
                const orderQty = suggestedOrderQty(product)
                const isSending = quickOrderingId === product.id

                return (
                  <div
                    key={product.id}
                    className={`rounded-2xl border-2 p-3 ${
                      outOfStock
                        ? "border-red-300 bg-red-50"
                        : lowStock
                          ? "border-amber-300 bg-amber-50"
                          : "border-transparent bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => pickProduct(product)}
                      className="flex w-full items-center gap-3 text-left hover:opacity-90"
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted">
                          <PackagePlus className="h-7 w-7 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-lg font-bold">{product.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {product.barcode || "Sin código"} · stock {stock}
                          {outOfStock && " · AGOTADO"}
                          {lowStock && !outOfStock && " · stock bajo"}
                        </p>
                      </div>
                    </button>
                    {(outOfStock || lowStock) && (
                      <Button
                        type="button"
                        className="mt-3 h-14 w-full text-lg font-black bg-emerald-600 hover:bg-emerald-700"
                        disabled={isSending}
                        onClick={() => quickSubmitProduct(product)}
                      >
                        {isSending
                          ? "Enviando..."
                          : `Pedir ya · ${orderQty} pza${orderQty === 1 ? "" : "s"}`}
                      </Button>
                    )}
                  </div>
                )
              })}
              {results.length === 0 && (
                <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-800">
                  No aparece en la lista. Abajo puedes pedirlo igual, con o sin foto.
                </p>
              )}
              <Button
                variant="outline"
                className="h-14 w-full text-lg font-bold"
                onClick={() => pickProduct("custom")}
              >
                Pedir algo que no está en el sistema
              </Button>
            </div>
          )}
        </div>

        {selected && (
          <div className="rounded-3xl border-4 border-rose-200 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-black">
              {selected === "custom" ? "Producto nuevo" : selected.name}
            </h2>
            {selected === "custom" && (
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="¿Cómo se llama?"
                className="mt-3 h-14 text-lg"
              />
            )}
            <p className="mt-4 text-lg font-bold">¿Cuántos se ocupan?</p>
            <div className="mt-2 flex items-center justify-center gap-5">
              <Button
                type="button"
                className="h-16 w-16 rounded-full text-3xl"
                variant="outline"
                onClick={() => setQty((n) => Math.max(1, n - 1))}
              >
                <Minus className="h-8 w-8" />
              </Button>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
                className="h-20 w-28 text-center text-4xl font-black"
              />
              <Button
                type="button"
                className="h-16 w-16 rounded-full bg-rose-800 text-white text-3xl"
                onClick={() => setQty((n) => n + 1)}
              >
                <Plus className="h-8 w-8" />
              </Button>
            </div>

            <div className="mt-5 rounded-2xl bg-rose-50 p-4">
              <p className="text-lg font-bold">Foto (si quieres)</p>
              <p className="text-sm text-muted-foreground">Si no hay foto, no pasa nada. Se puede pedir igual.</p>
              {photoUrl ? (
                <img src={photoUrl} alt="" className="mt-3 h-32 w-32 rounded-2xl object-cover" />
              ) : null}
              <input
                ref={selected === "custom" ? customPhotoRef : photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePhoto(e.target.files?.[0])
                  e.target.value = ""
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-14 w-full text-lg font-bold"
                disabled={uploadingPhoto}
                onClick={() =>
                  (selected === "custom" ? customPhotoRef : photoInputRef).current?.click()
                }
              >
                <Camera className="mr-2 h-5 w-5" />
                {uploadingPhoto ? "Subiendo foto..." : photoUrl ? "Cambiar foto" : "Tomar o elegir foto"}
              </Button>
            </div>

            <Button className="mt-5 h-16 w-full text-xl font-black bg-rose-800" onClick={addItem}>
              Agregar a la lista
            </Button>
          </div>
        )}

        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">Lista de este pedido</h2>
          {items.length === 0 ? (
            <p className="mt-3 text-lg text-muted-foreground">Todavía no hay nada. Busca arriba y agrégalo.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {items.map((item) => (
                <div key={item.key} className="flex items-center gap-3 rounded-2xl border p-3">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
                      Sin foto
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-bold">{item.product_name}</p>
                    <p className="text-base text-rose-800 font-black">{item.quantity} pza</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 text-red-600"
                    onClick={() => setItems((current) => current.filter((row) => row.key !== item.key))}
                  >
                    <Trash2 className="h-6 w-6" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-2xl bg-red-100 p-4 text-center text-lg font-bold text-red-800">{error}</p>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white p-4">
        <div className="mx-auto max-w-3xl">
          <Button
            className="h-18 w-full h-16 text-2xl font-black bg-emerald-600 hover:bg-emerald-700"
            disabled={saving || items.length === 0}
            onClick={submit}
          >
            {saving ? "Guardando..." : `Ya terminé · ${items.length} producto${items.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
