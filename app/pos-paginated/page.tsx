"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus } from "lucide-react"

const PRODUCTS_PER_PAGE = 30

export default function PosPaginated() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const [products, setProducts] = useState<any[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [cart, setCart] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    setLoading(true)
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(0, 9999)

    console.log("[v0] TOTAL PRODUCTOS CARGADOS:", data?.length || 0)
    setProducts(data || [])
    setCurrentPage(1)
    setLoading(false)
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.barcode && product.barcode.includes(searchTerm)),
  )

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE,
  )

  const addToCart = (product: any) => {
    const existingItem = cart.find((item) => item.product.id === product.id)
    if (existingItem) {
      setCart(cart.map((item) => (item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)))
    } else {
      setCart([...cart, { product, quantity: 1 }])
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-green-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-green-600 bg-clip-text text-transparent">
          Punto de Venta - Búsqueda Paginada
        </h1>

        <Card className="mb-6 border-green-200">
          <CardContent className="p-4">
            <Input
              placeholder="Buscar por nombre o código de barras..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              className="border-green-200 focus:border-green-400"
            />
          </CardContent>
        </Card>

        <div className="mb-4 text-sm text-gray-600">
          Mostrando {paginatedProducts.length} de {filteredProducts.length} productos
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
          {paginatedProducts.map((product) => (
            <Card key={product.id} className="cursor-pointer hover:shadow-lg transition-all border-0 shadow-md">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <h3 className="font-bold text-sm line-clamp-2">{product.name}</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-purple-600">${product.price.toFixed(2)}</span>
                    <Badge variant={product.stock_quantity > 0 ? "default" : "destructive"}>
                      {product.stock_quantity}
                    </Badge>
                  </div>
                  <Button
                    onClick={() => addToCart(product)}
                    size="sm"
                    className="w-full bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700"
                    disabled={product.stock_quantity === 0}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Agregar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pagination Controls */}
        <div className="flex justify-center items-center gap-2 mb-6">
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

        {/* Simple Cart Display */}
        <Card className="mt-8 bg-purple-50 border-purple-200">
          <CardHeader>
            <CardTitle className="text-purple-700">Carrito ({cart.length} items)</CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <p className="text-gray-600">El carrito está vacío</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-auto">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex justify-between text-sm p-2 bg-white rounded">
                    <span>
                      {item.product.name} x{item.quantity}
                    </span>
                    <span>${(item.product.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
