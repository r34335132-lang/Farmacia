"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PRODUCTS_PER_PAGE = 50

export default function AdminProductsPaginated() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const [products, setProducts] = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    const { data } = await supabase.from("products").select("*").order("name", { ascending: true }).range(0, 9999)

    console.log("[v0] TOTAL PRODUCTOS CARGADOS ADMIN:", data?.length || 0)
    setProducts(data || [])
    setCurrentPage(1)
    setLoading(false)
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Productos (Búsqueda Paginada)</h1>
        <Button className="bg-gradient-to-r from-purple-600 to-green-600">Agregar Producto</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Buscar productos por nombre o código..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              setCurrentPage(1)
            }}
            className="w-full"
          />
        </CardContent>
      </Card>

      <div className="text-sm text-gray-600">
        Mostrando {paginatedProducts.length} de {filteredProducts.length} productos
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.barcode}</TableCell>
                <TableCell>${product.price.toFixed(2)}</TableCell>
                <TableCell>
                  <Badge variant={product.stock_quantity > 0 ? "default" : "destructive"}>
                    {product.stock_quantity}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline">
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination Controls */}
      <div className="flex justify-center items-center gap-2">
        <Button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          variant="outline"
        >
          Anterior
        </Button>

        <div className="flex gap-2">
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const pageNum = i + 1
            return (
              <Button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                variant={currentPage === pageNum ? "default" : "outline"}
              >
                {pageNum}
              </Button>
            )
          })}
          {totalPages > 5 && <span>...</span>}
        </div>

        <Button
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          variant="outline"
        >
          Siguiente
        </Button>
      </div>

      <div className="text-center text-sm text-gray-600">
        Página {currentPage} de {totalPages}
      </div>
    </div>
  )
}
