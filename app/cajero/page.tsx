"use client"

import React from "react"

import { useState, useEffect } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import Loading from "./loading"

import {
  Search,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  User,
  Phone,
  ShoppingBag,
  ArrowLeft,
  Timer,
  Eye,
  Check,
  X,
  ShoppingCart,
  ClipboardList,
  LogOut,
  Lock,
  Edit,
  Save,
  AlertTriangle,
} from "lucide-react"

interface OrderItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
}

interface Order {
  id: string
  order_number: string
  pickup_code: string
  customer_name: string
  customer_phone: string
  subtotal: number
  discount: number
  total: number
  status: "pending" | "preparing" | "ready" | "completed" | "cancelled"
  notes: string | null
  created_at: string
  updated_at: string
  items?: OrderItem[]
}

interface UserProfile {
  id: string
  email: string
  full_name: string
  role: string
}

interface Product {
  id: string
  name: string
  description: string
  barcode: string
  price: number
  stock_quantity: number
  min_stock_level: number
  category: string
  is_active: boolean
  created_at: string
  image_url?: string
  expiration_date?: string
  days_before_expiry_alert?: number
  section?: string
}

const statusConfig = {
  pending: { label: "Pendiente", color: "bg-yellow-500", icon: Clock, textColor: "text-yellow-600" },
  preparing: { label: "Preparando", color: "bg-blue-500", icon: Timer, textColor: "text-blue-600" },
  ready: { label: "Listo", color: "bg-green-500", icon: CheckCircle2, textColor: "text-green-600" },
  completed: { label: "Entregado", color: "bg-gray-500", icon: Check, textColor: "text-gray-600" },
  cancelled: { label: "Cancelado", color: "bg-red-500", icon: XCircle, textColor: "text-red-600" },
}

function CajeroContent() {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("pending")
  const [isUpdating, setIsUpdating] = useState(false)
  const [pickupCodeSearch, setPickupCodeSearch] = useState("")
  const [activeView, setActiveView] = useState<"menu" | "orders" | "inventory">("menu")

  // Login state
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Inventory state
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    price: "",
    stock_quantity: "",
    min_stock_level: "",
    category: "",
    section: "",
    expiration_date: "",
  })

  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    setIsCheckingAuth(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (authUser) {
        // Get user profile
        const { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .single()

        if (profile) {
          setUser({
            id: authUser.id,
            email: authUser.email || "",
            full_name: profile.full_name || authUser.email || "",
            role: profile.role || "cajero"
          })
          setIsAuthenticated(true)
        }
      }
    } catch (error) {
      console.error("Error checking auth:", error)
    } finally {
      setIsCheckingAuth(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError("")
    setIsLoggingIn(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setLoginError("Credenciales incorrectas")
        return
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from("users")
          .select("*")
          .eq("id", data.user.id)
          .single()

        setUser({
          id: data.user.id,
          email: data.user.email || "",
          full_name: profile?.full_name || data.user.email || "",
          role: profile?.role || "cajero"
        })
        setIsAuthenticated(true)
      }
    } catch (error) {
      setLoginError("Error al iniciar sesion")
    } finally {
      setIsLoggingIn(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setIsAuthenticated(false)
    setActiveView("menu")
  }

  // Load products for inventory view
  async function loadProducts() {
    setLoading(true)
    try {
      const response = await fetch("/api/products")
      const { products: data } = await response.json()
      const activeProducts = (data || []).filter((p: Product) => p.is_active !== false)
      setProducts(activeProducts)
      setFilteredProducts(activeProducts)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  // Filter products based on search term
  useEffect(() => {
    if (activeView === "inventory") {
      const filtered = products.filter(
        (product) =>
          product.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
          product.barcode?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
          product.category?.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
          product.section?.toLowerCase().includes(productSearchTerm.toLowerCase())
      )
      setFilteredProducts(filtered)
    }
  }, [products, productSearchTerm, activeView])

  // Open edit dialog for a product
  function openEditDialog(product: Product) {
    setEditingProduct(product)
    setEditFormData({
      name: product.name,
      description: product.description || "",
      barcode: product.barcode || "",
      price: product.price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      min_stock_level: product.min_stock_level.toString(),
      category: product.category || "",
      section: product.section || "",
      expiration_date: product.expiration_date || "",
    })
    setIsEditDialogOpen(true)
  }

  // Save edited product
  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!editingProduct) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from("products")
        .update({
          name: editFormData.name,
          description: editFormData.description,
          barcode: editFormData.barcode || null,
          price: Number.parseFloat(editFormData.price),
          stock_quantity: Number.parseInt(editFormData.stock_quantity),
          min_stock_level: Number.parseInt(editFormData.min_stock_level),
          category: editFormData.category,
          section: editFormData.section || null,
          expiration_date: editFormData.expiration_date || null,
        })
        .eq("id", editingProduct.id)

      if (error) throw error

      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: editFormData.name,
                description: editFormData.description,
                barcode: editFormData.barcode,
                price: Number.parseFloat(editFormData.price),
                stock_quantity: Number.parseInt(editFormData.stock_quantity),
                min_stock_level: Number.parseInt(editFormData.min_stock_level),
                category: editFormData.category,
                section: editFormData.section,
                expiration_date: editFormData.expiration_date,
              }
            : p
        )
      )

      setIsEditDialogOpen(false)
      setEditingProduct(null)
      alert("Producto actualizado exitosamente")
    } catch (error) {
      console.error("Error updating product:", error)
      alert("Error al actualizar el producto")
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated && activeView === "orders") {
      loadOrders()

      const channel = supabase
        .channel("orders-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          () => {
            loadOrders()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    if (isAuthenticated && activeView === "inventory") {
      loadProducts()
    }
  }, [isAuthenticated, activeView])

  async function loadOrders() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      if (data) {
        setOrders(data)
      }
    } catch (error) {
      console.error("Error loading orders:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadOrderItems(orderId: string) {
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)

    return data || []
  }

  async function openOrderDetails(order: Order) {
    const items = await loadOrderItems(order.id)
    setSelectedOrder({ ...order, items })
    setIsDetailsOpen(true)
  }

  async function updateOrderStatus(orderId: string, newStatus: string) {
    setIsUpdating(true)
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", orderId)

      if (error) throw error

      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus as Order["status"] } : o))
      )

      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus as Order["status"] } : null))
      }
    } catch (error) {
      console.error("Error updating order:", error)
      alert("Error al actualizar el pedido")
    } finally {
      setIsUpdating(false)
    }
  }

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.pickup_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer_phone.includes(searchTerm)

    if (activeTab === "all") return matchesSearch
    return matchesSearch && order.status === activeTab
  })

  const orderCounts = {
    pending: orders.filter((o) => o.status === "pending").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    ready: orders.filter((o) => o.status === "ready").length,
    completed: orders.filter((o) => o.status === "completed").length,
    cancelled: orders.filter((o) => o.status === "cancelled").length,
  }

  const searchByPickupCode = () => {
    if (!pickupCodeSearch.trim()) return
    const found = orders.find(
      (o) => o.pickup_code.toLowerCase() === pickupCodeSearch.toLowerCase().trim()
    )
    if (found) {
      openOrderDetails(found)
      setPickupCodeSearch("")
    } else {
      alert("No se encontro ningun pedido con ese codigo")
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const getTimeSince = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  // Show loading state
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Verificando sesion...</p>
        </div>
      </div>
    )
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <Image
                src="/logo.jpeg"
                alt="Farmacia Bienestar"
                width={80}
                height={80}
                className="rounded-full"
              />
            </div>
            <CardTitle className="text-2xl">Panel de Cajero</CardTitle>
            <CardDescription>Inicia sesion para acceder al sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electronico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contrasena</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="********"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {loginError && (
                <p className="text-sm text-destructive text-center">{loginError}</p>
              )}
              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Iniciando...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Iniciar Sesion
                  </>
                )}
              </Button>
            </form>
            <div className="mt-4 text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
                Volver al inicio
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show menu to choose between POS and Orders
  if (activeView === "menu") {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="sticky top-0 z-50 bg-background border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo.jpeg"
                  alt="Farmacia Bienestar"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <div>
                  <h1 className="font-bold text-lg text-primary">Panel de Cajero</h1>
                  <p className="text-xs text-muted-foreground">Bienvenido, {user?.full_name}</p>
                </div>
              </div>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Cerrar Sesion
              </Button>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Selecciona una opcion</h2>
            <p className="text-muted-foreground">Elige que deseas hacer hoy</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => router.push("/pos")}
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingCart className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Punto de Venta</h3>
                <p className="text-muted-foreground">
                  Registra ventas directas en mostrador
                </p>
                <Button className="mt-4 w-full">
                  Ir a POS
                </Button>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => setActiveView("orders")}
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-xl font-bold mb-2">Ver Pedidos</h3>
                <p className="text-muted-foreground">
                  Gestiona pedidos de la tienda en linea
                </p>
                <Button className="mt-4 w-full bg-transparent" variant="outline">
                  Ver Pedidos
                </Button>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => setActiveView("inventory")}
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="h-10 w-10 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold mb-2">Editar Inventario</h3>
                <p className="text-muted-foreground">
                  Modifica informacion de productos
                </p>
                <Button className="mt-4 w-full bg-transparent" variant="outline">
                  Editar Productos
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  // Show inventory view
  if (activeView === "inventory") {
    return (
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background border-b">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => setActiveView("menu")}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Image
                  src="/logo.jpeg"
                  alt="Farmacia Bienestar"
                  width={40}
                  height={40}
                  className="rounded-full"
                />
                <div>
                  <h1 className="font-bold text-lg text-primary">Editar Inventario</h1>
                  <p className="text-xs text-muted-foreground">{user?.full_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={loadProducts}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="container mx-auto px-4 py-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Productos
                  </CardTitle>
                  <CardDescription>
                    {filteredProducts.length} productos encontrados - Solo puedes editar, no agregar ni eliminar
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Solo edicion
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No se encontraron productos</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Seccion</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.slice(0, 50).map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {product.image_url && (
                                <Image
                                  src={product.image_url || "/placeholder.svg"}
                                  alt={product.name}
                                  width={40}
                                  height={40}
                                  className="rounded object-cover"
                                />
                              )}
                              <div>
                                <p className="font-medium">{product.name}</p>
                                {product.barcode && (
                                  <p className="text-xs text-muted-foreground">{product.barcode}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{product.section || "Sin seccion"}</Badge>
                          </TableCell>
                          <TableCell>{product.category || "-"}</TableCell>
                          <TableCell className="text-right font-medium">
                            ${product.price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className={product.stock_quantity <= product.min_stock_level ? "text-destructive font-bold" : ""}>
                              {product.stock_quantity}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(product)}
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredProducts.length > 50 && (
                    <p className="text-center text-sm text-muted-foreground mt-4">
                      Mostrando 50 de {filteredProducts.length} productos. Usa el buscador para encontrar mas.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* Edit Product Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Editar Producto
              </DialogTitle>
              <DialogDescription>
                Modifica la informacion del producto. Los campos marcados con * son obligatorios.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveProduct}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Nombre *</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-price">Precio *</Label>
                    <Input
                      id="edit-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.price}
                      onChange={(e) => setEditFormData({ ...editFormData, price: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-stock">Stock *</Label>
                    <Input
                      id="edit-stock"
                      type="number"
                      min="0"
                      value={editFormData.stock_quantity}
                      onChange={(e) => setEditFormData({ ...editFormData, stock_quantity: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-section">Seccion</Label>
                    <Input
                      id="edit-section"
                      value={editFormData.section}
                      onChange={(e) => setEditFormData({ ...editFormData, section: e.target.value.toUpperCase() })}
                      placeholder="Ej: A1, B2"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-category">Categoria</Label>
                    <Input
                      id="edit-category"
                      value={editFormData.category}
                      onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-barcode">Codigo de Barras</Label>
                    <Input
                      id="edit-barcode"
                      value={editFormData.barcode}
                      onChange={(e) => setEditFormData({ ...editFormData, barcode: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-min-stock">Stock Minimo</Label>
                    <Input
                      id="edit-min-stock"
                      type="number"
                      min="0"
                      value={editFormData.min_stock_level}
                      onChange={(e) => setEditFormData({ ...editFormData, min_stock_level: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-expiration">Fecha de Vencimiento</Label>
                  <Input
                    id="edit-expiration"
                    type="date"
                    value={editFormData.expiration_date}
                    onChange={(e) => setEditFormData({ ...editFormData, expiration_date: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-description">Descripcion</Label>
                  <Input
                    id="edit-description"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Show orders view
  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setActiveView("menu")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <Image
                src="/logo.jpeg"
                alt="Farmacia Bienestar"
                width={40}
                height={40}
                className="rounded-full"
              />
              <div>
                <h1 className="font-bold text-lg text-primary">Gestion de Pedidos</h1>
                <p className="text-xs text-muted-foreground">{user?.full_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Codigo de recogida..."
                  value={pickupCodeSearch}
                  onChange={(e) => setPickupCodeSearch(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && searchByPickupCode()}
                  className="w-40 uppercase"
                />
                <Button onClick={searchByPickupCode}>Buscar</Button>
              </div>
              <Button variant="outline" size="icon" onClick={loadOrders}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Pendientes</p>
                  <p className="text-3xl font-bold text-yellow-700">{orderCounts.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Preparando</p>
                  <p className="text-3xl font-bold text-blue-700">{orderCounts.preparing}</p>
                </div>
                <Timer className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600 font-medium">Listos</p>
                  <p className="text-3xl font-bold text-green-700">{orderCounts.ready}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-50 border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium">Entregados</p>
                  <p className="text-3xl font-bold text-gray-700">{orderCounts.completed}</p>
                </div>
                <Check className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">Cancelados</p>
                  <p className="text-3xl font-bold text-red-700">{orderCounts.cancelled}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orders Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Pedidos</CardTitle>
                <CardDescription>Gestiona los pedidos de los clientes</CardDescription>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar pedido..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="pending" className="gap-2">
                  Pendientes
                  {orderCounts.pending > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {orderCounts.pending}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="preparing">Preparando</TabsTrigger>
                <TabsTrigger value="ready">Listos</TabsTrigger>
                <TabsTrigger value="completed">Entregados</TabsTrigger>
                <TabsTrigger value="all">Todos</TabsTrigger>
              </TabsList>

              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Telefono</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Tiempo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No hay pedidos para mostrar
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrders.map((order) => {
                        const config = statusConfig[order.status]
                        const StatusIcon = config.icon
                        return (
                          <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50">
                            <TableCell className="font-mono font-bold text-primary">
                              {order.pickup_code}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                {order.customer_name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                {order.customer_phone}
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold">${order.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge className={`${config.color} text-white gap-1`}>
                                <StatusIcon className="h-3 w-3" />
                                {config.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {getTimeSince(order.created_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openOrderDetails(order)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Ver
                                </Button>
                                {order.status === "pending" && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateOrderStatus(order.id, "preparing")}
                                    disabled={isUpdating}
                                  >
                                    Preparar
                                  </Button>
                                )}
                                {order.status === "preparing" && (
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => updateOrderStatus(order.id, "ready")}
                                    disabled={isUpdating}
                                  >
                                    Listo
                                  </Button>
                                )}
                                {order.status === "ready" && (
                                  <Button
                                    size="sm"
                                    onClick={() => updateOrderStatus(order.id, "completed")}
                                    disabled={isUpdating}
                                  >
                                    Entregar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </main>

      {/* Order Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5" />
              Detalle del Pedido
            </DialogTitle>
            <DialogDescription>
              {selectedOrder?.order_number}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Pickup Code */}
              <div className="bg-primary/10 rounded-xl p-4 text-center">
                <p className="text-sm text-muted-foreground mb-1">Codigo de Recogida</p>
                <p className="text-3xl font-mono font-bold tracking-wider text-primary">
                  {selectedOrder.pickup_code}
                </p>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Cliente</p>
                    <p className="font-medium">{selectedOrder.customer_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Telefono</p>
                    <p className="font-medium">{selectedOrder.customer_phone}</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estado</p>
                    <Badge className={`${statusConfig[selectedOrder.status].color} text-white mt-1`}>
                      {statusConfig[selectedOrder.status].label}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Creado</p>
                  <p className="text-sm font-medium">{formatDate(selectedOrder.created_at)}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <p className="text-sm font-medium mb-2">Productos</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedOrder.items?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.quantity}x</span>
                        <span className="text-sm">{item.product_name}</span>
                      </div>
                      <span className="text-sm font-medium">${item.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Total */}
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">${selectedOrder.total.toFixed(2)}</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {selectedOrder.status === "pending" && (
                  <>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, "cancelled")
                        setIsDetailsOpen(false)
                      }}
                      disabled={isUpdating}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={() => {
                        updateOrderStatus(selectedOrder.id, "preparing")
                        setIsDetailsOpen(false)
                      }}
                      disabled={isUpdating}
                    >
                      <Timer className="h-4 w-4 mr-2" />
                      Preparar
                    </Button>
                  </>
                )}
                {selectedOrder.status === "preparing" && (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => {
                      updateOrderStatus(selectedOrder.id, "ready")
                      setIsDetailsOpen(false)
                    }}
                    disabled={isUpdating}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Marcar como Listo
                  </Button>
                )}
                {selectedOrder.status === "ready" && (
                  <Button
                    className="w-full"
                    onClick={() => {
                      updateOrderStatus(selectedOrder.id, "completed")
                      setIsDetailsOpen(false)
                    }}
                    disabled={isUpdating}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Confirmar Entrega
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function CajeroDashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <CajeroContent />
    </Suspense>
  )
}
