"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminPageHeader } from "@/components/admin-page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Download, Printer, CheckCircle2 } from "lucide-react"
import {
  buildSupplyRequestDocumentHtml,
  downloadSupplyRequestDocument,
  openSupplyRequestDocument,
  type BuyListItem,
} from "@/lib/supply-request-document"

type RequestRow = {
  id: string
  request_number: string
  status: string
  created_at: string
  branches?: { name: string } | { name: string }[] | null
  profiles?: { full_name: string } | { full_name: string }[] | null
  supply_request_items?: {
    product_name: string
    quantity: number
    photo_url?: string | null
  }[]
}

function relName(value: { name?: string; full_name?: string } | { name?: string; full_name?: string }[] | null | undefined) {
  const item = Array.isArray(value) ? value[0] : value
  return item?.name || item?.full_name || "—"
}

export default function PedidosCajaAdminPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [buyList, setBuyList] = useState<BuyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqRes, buyRes] = await Promise.all([
        fetch("/api/supply-requests"),
        fetch("/api/supply-requests/buy-list"),
      ])
      const reqData = await reqRes.json()
      const buyData = await buyRes.json()
      if (!reqRes.ok) throw new Error(reqData.error || "No se pudieron cargar los pedidos")
      setRequests(reqData.requests || [])
      setBuyList(buyData.items || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const html = buildSupplyRequestDocumentHtml({
    title: "Lista para comprar",
    subtitle: "Lo que pidieron las sucursales",
    items: buyList,
  })

  const markPurchased = async (id: string) => {
    const res = await fetch("/api/supply-requests", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "purchased" }),
    })
    if (res.ok) load()
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminPageHeader
        title="Pedidos de caja"
        subtitle="Lo que pidieron las cajeras, con cantidad por sucursal"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => openSupplyRequestDocument(html)}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            <Button
              onClick={() =>
                downloadSupplyRequestDocument(
                  html,
                  `lista-compra-${new Date().toISOString().slice(0, 10)}.html`,
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar
            </Button>
          </div>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {error && <p className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Para comprar ahora ({buyList.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-muted-foreground">Cargando...</p>
            ) : buyList.length === 0 ? (
              <p className="text-muted-foreground">Nadie ha pedido mercancía todavía.</p>
            ) : (
              buyList.map((item) => (
                <div key={`${item.product_name}-${item.barcode}`} className="flex items-center gap-4 rounded-xl border p-3">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">
                      Sin foto
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{item.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.branches.map((b) => `${b.branch_name}: ${b.quantity}`).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-rose-800">{item.total}</p>
                    <p className="text-xs text-muted-foreground">comprar</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-lg font-bold">Pedidos enviados</h2>
          {requests.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold">{row.request_number}</p>
                  <p className="text-sm text-muted-foreground">
                    {relName(row.branches)} · {relName(row.profiles)} ·{" "}
                    {new Date(row.created_at).toLocaleString("es-MX")}
                  </p>
                  <p className="text-sm">
                    {(row.supply_request_items || [])
                      .map((item) => `${item.product_name} (${item.quantity})`)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.status === "submitted" ? "default" : "secondary"}>
                    {row.status === "submitted" ? "Pendiente" : row.status === "purchased" ? "Comprado" : "Cancelado"}
                  </Badge>
                  {row.status === "submitted" && (
                    <Button size="sm" variant="outline" onClick={() => markPurchased(row.id)}>
                      <CheckCircle2 className="mr-1 h-4 w-4" />
                      Ya se compró
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button variant="outline" onClick={() => router.push("/pos/pedido")}>
          Hacer un pedido desde caja
        </Button>
      </div>
    </div>
  )
}
