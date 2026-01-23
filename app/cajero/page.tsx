"use client"

import React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
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
import { ImageUpload } from "@/components/image-upload"

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
  Edit,
  Save,
  AlertTriangle,
  Bell,
  BellRing,
  Printer,
  Receipt,
  DollarSign,
  History,
  ImageIcon,
  MapPin,
  Volume2,
  VolumeX,
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

interface Sale {
  id: string
  cashier_id: string
  subtotal_before_discount: number
  discount_type: string
  discount_value: number
  discount_reason: string | null
  total_amount: number
  payment_method: string
  cash_received: number | null
  change_given: number | null
  status: string
  created_at: string
  items?: SaleItem[]
}

interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  quantity: number
  unit_price: number
  subtotal: number
  product?: Product
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
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("pending")
  const [isUpdating, setIsUpdating] = useState(false)
  const [pickupCodeSearch, setPickupCodeSearch] = useState("")
  const [activeView, setActiveView] = useState<"menu" | "orders" | "inventory" | "sales">("menu")

  // Inventory state - solo foto y seccion
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editFormData, setEditFormData] = useState({
    section: "",
    image_url: "",
  })

  // Sales state
  const [sales, setSales] = useState<Sale[]>([])
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null)
  const [isSaleDetailsOpen, setIsSaleDetailsOpen] = useState(false)

  // Alert state
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [hasNewOrder, setHasNewOrder] = useState(false)
  const [lastOrderCount, setLastOrderCount] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const supabase = createClient()
  const router = useRouter()

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleR4TUnXA5Nh8LRBMZ6/h4pRRHzxVmeXqj1YcQl6X4emieCAqUpLY5a9/Lg9HgcfnwXsiE0d0tOPYiT4dQGOr4+CTVSIvT4XP58V2KBBFccDp2X0lFER0t+XYhDchQGOm4OWUVygwT4LP58R2KxRIc8Dp130mFkV0t+XZhDYfP2Ol4OSUWS0zUILP58N2KxVKdMDp1XwnF0Z0t+XahDUeP2Kl4OOTWzI2UoLP58J1KxdMdcDp1HsoGEd0t+XbhDQdPmKl4OKSXTc5VILPgv58JxNKdMDp1XsnF0Z0t+XbhDQdPWGk4OGRXzo7VoLP5752KRlOdcDp1HonFkV0t+XchDMcPGCj4OCQYTs+WILPgr52KhpPdsHq03kmFUR0t+bdhDIbO1+j4N+PYj5BWoLPgb11KxxRd8Hq0XglFEN0uOfehDEaOl6i4N6OY0BEXILPgL11LB5TeMHqz3ckE0J0uejfgy8YOV2h4N2NY0JHXoLPf711LSFVecLqznYjEkFzuungg+8XN1ug4NyMZERJYILPfr11LiNXesLqzHUiEUBzuurgge0VNVqf4NuLZUZLYoLPfb11MCVZe8PryXQhD0Bzuu7gf+sTM1me4NmKZkdNZILPfL1wMCdb/MPqyHMgDj9zuO/hfucRMVid39mIZ0lPZoLPe71vMildfcTpxnEfDT1yt/HifuUPL1ec39aGaEtSaILPerxuMytffsToxG8eDDxytfLifOMNLVWb3tWFaU1UaoLPebtuNC1hgMXnwm0dCzpxs/PjeeALK1OZ3tODak9WbILPeLptNS9jgsbmwGsbCjlwsvTkdt0JKVGYgOx/a1FYboLPd7lsNjFkgsfkvmkZCDdvsfXlc9oHJ0+W3c5+bFNab4LPdrhrNzNmg8jjvGcYBzZusPble9cFJU2V3Mt8bVVdcoLPdLdqODVohMnhuWUXBTRtr/jmdNMDI0qT28l6blhfcoLPc7ZpOTdph8rgumMWBDNsrvnncNAAIUiS2sd5b1phc4LPcbVoOjlrismft2EUAzFqrProcswAHkWQ2cV3cFxjdILPb7RnOztt")
    return () => {
      if (audioRef.current) {
        audioRef.current = null
      }
    }
  }, [])

  // Play notification sound
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(console.error)
    }
  }, [soundEnabled])

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    setIsCheckingAuth(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      
      if (!authUser) {
        // Middleware should handle redirect, but just in case
        router.push("/auth/login")
        return
      }

      // Get user profile - try both tables
      let profile = null
      const { data: usersData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single()

      if (usersData) {
        profile = usersData
      } else {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authUser.id)
          .single()
        profile = profilesData
      }

      if (profile) {
        setUser({
          id: authUser.id,
          email: authUser.email || "",
          full_name: profile.full_name || authUser.email || "",
          role: profile.role || "cajero"
        })
      } else {
        setUser({
          id: authUser.id,
          email: authUser.email || "",
          full_name: authUser.email || "",
          role: "cajero"
        })
      }
    } catch (error) {
      console.error("Error checking auth:", error)
    } finally {
      setIsCheckingAuth(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/auth/login")
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

  // Load sales for current cashier
  async function loadSales() {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("cashier_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50)

      if (error) throw error
      setSales(data || [])
    } catch (error) {
      console.error("Error loading sales:", error)
    } finally {
      setLoading(false)
    }
  }

  // Load sale items
  async function loadSaleItems(saleId: string) {
    const { data, error } = await supabase
      .from("sale_items")
      .select(`
        *,
        product:products(name, barcode, section)
      `)
      .eq("sale_id", saleId)

    if (error) {
      console.error("Error loading sale items:", error)
      return []
    }
    return data || []
  }

  // Open sale details
  async function openSaleDetails(sale: Sale) {
    const items = await loadSaleItems(sale.id)
    setSelectedSale({ ...sale, items })
    setIsSaleDetailsOpen(true)
  }

  // Reprint receipt
  function reprintReceipt(sale: Sale) {
    if (!sale.items || !user) return

    const receiptContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Ticket de Venta - Farmacia Bienestar</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 13px;
            width: 55mm;
            max-width: 55mm;
            background: white;
            color: #000;
            line-height: 1.4;
        }
        .content { width: 100%; max-width: 55mm; padding: 2mm; }
        .center { text-align: center; margin-bottom: 5px; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 5px; }
        .line { border-bottom: 1px solid #000; margin: 8px 0; }
        .dashed-line { border-bottom: 1px dashed #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; }
        .item-row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 11px; }
        .bold { font-weight: bold; }
        .small { font-size: 10px; }
        .reprint { background: #fef3c7; padding: 4px; text-align: center; font-weight: bold; margin-bottom: 8px; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; width: 55mm !important; }
            .content { width: 55mm !important; padding: 2mm !important; }
            @page { size: 55mm auto; margin: 0 !important; }
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="reprint">*** REIMPRESION ***</div>
        <div class="center title">FARMACIA BIENESTAR</div>
        <div class="center small">Tu salud es nuestro compromiso</div>
        <div class="center small">Calle Principal #123</div>
        <div class="center small">Tel: (555) 123-4567</div>
        
        <div class="line"></div>
        
        <div class="row">
            <span>TICKET:</span>
            <span>#${sale.id.slice(-8).toUpperCase()}</span>
        </div>
        <div class="row">
            <span>FECHA:</span>
            <span>${new Date(sale.created_at).toLocaleDateString("es-ES")}</span>
        </div>
        <div class="row">
            <span>HORA:</span>
            <span>${new Date(sale.created_at).toLocaleTimeString("es-ES", { hour12: false })}</span>
        </div>
        <div class="row">
            <span>CAJERO:</span>
            <span>${user.full_name}</span>
        </div>
        
        <div class="line"></div>
        
        <div class="center small bold">PRODUCTOS</div>
        
        ${sale.items.map((item: any) => `
        <div class="item-row">
            <span>${item.product?.name || "Producto"}</span>
            <span></span>
        </div>
        ${item.product?.section ? `<div class="item-row"><span>  Sec: ${item.product.section}</span><span></span></div>` : ""}
        <div class="item-row">
            <span>  ${item.quantity} x $${item.unit_price.toFixed(2)}</span>
            <span>$${item.subtotal.toFixed(2)}</span>
        </div>
        `).join("")}
        
        <div class="dashed-line"></div>
        
        <div class="row">
            <span>SUBTOTAL:</span>
            <span>$${sale.subtotal_before_discount.toFixed(2)}</span>
        </div>
        ${sale.discount_value > 0 ? `
        <div class="row">
            <span>DESCUENTO (${sale.discount_reason || ""}):</span>
            <span>-$${(sale.subtotal_before_discount - sale.total_amount).toFixed(2)}</span>
        </div>
        ` : ""}
        <div class="row bold">
            <span>TOTAL:</span>
            <span>$${sale.total_amount.toFixed(2)}</span>
        </div>
        
        <div class="dashed-line"></div>
        
        <div class="row">
            <span>PAGO:</span>
            <span>${sale.payment_method === "efectivo" ? "EFECTIVO" : "TARJETA"}</span>
        </div>
        ${sale.payment_method === "efectivo" && sale.cash_received ? `
        <div class="row">
            <span>RECIBIDO:</span>
            <span>$${sale.cash_received.toFixed(2)}</span>
        </div>
        <div class="row bold">
            <span>CAMBIO:</span>
            <span>$${(sale.change_given || 0).toFixed(2)}</span>
        </div>
        ` : ""}
        
        <div class="line"></div>
        
        <div class="center small" style="margin-top: 10px;">
            <div><strong>GRACIAS POR SU COMPRA</strong></div>
            <div>Conserve su ticket</div>
            <div style="margin-top: 8px; font-size: 9px;">
                Reimpreso: ${new Date().toLocaleString("es-ES")}
            </div>
        </div>
    </div>
</body>
</html>
    `

    const printWindow = window.open("", "_blank", "width=400,height=600")
    if (printWindow) {
      printWindow.document.write(receiptContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 250)
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

  // Open edit dialog for a product - SOLO foto y seccion
  function openEditDialog(product: Product) {
    setEditingProduct(product)
    setEditFormData({
      section: product.section || "",
      image_url: product.image_url || "",
    })
    setIsEditDialogOpen(true)
  }

  // Save edited product - SOLO foto y seccion
  async function handleSaveProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!editingProduct) return

    setIsSaving(true)
    try {
      const { error } = await supabase
        .from("products")
        .update({
          section: editFormData.section || null,
          image_url: editFormData.image_url || null,
        })
        .eq("id", editingProduct.id)

      if (error) throw error

      // Update local state
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                section: editFormData.section,
                image_url: editFormData.image_url,
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
    if (user && activeView === "orders") {
      loadOrders()

      // Subscribe to new orders with alert
      const channel = supabase
        .channel("orders-changes-cajero")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          (payload) => {
            // New order arrived
            setHasNewOrder(true)
            playNotificationSound()
            loadOrders()
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders" },
          () => {
            loadOrders()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    if (user && activeView === "inventory") {
      loadProducts()
    }

    if (user && activeView === "sales") {
      loadSales()
    }
  }, [user, activeView])

  async function loadOrders() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error
      if (data) {
        // Check for new pending orders
        const pendingCount = data.filter(o => o.status === "pending").length
        if (pendingCount > lastOrderCount && lastOrderCount > 0) {
          setHasNewOrder(true)
          playNotificationSound()
        }
        setLastOrderCount(pendingCount)
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
    setHasNewOrder(false)
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

  // Show menu to choose between POS, Orders, Inventory, and Sales
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

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => router.push("/pos")}
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShoppingCart className="h-10 w-10 text-primary" />
                </div>
                <h3 className="text-xl font-bold mb-2">Punto de Venta</h3>
                <p className="text-muted-foreground text-sm">
                  Registra ventas directas en mostrador
                </p>
                <Button className="mt-4 w-full">
                  Ir a POS
                </Button>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary relative"
              onClick={() => setActiveView("orders")}
            >
              {orderCounts.pending > 0 && (
                <div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold animate-pulse">
                  {orderCounts.pending}
                </div>
              )}
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="h-10 w-10 text-green-600" />
                </div>
                <h3 className="text-xl font-bold mb-2">Ver Pedidos</h3>
                <p className="text-muted-foreground text-sm">
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
                <p className="text-muted-foreground text-sm">
                  Modifica foto y seccion de productos
                </p>
                <Button className="mt-4 w-full bg-transparent" variant="outline">
                  Editar Productos
                </Button>
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary"
              onClick={() => setActiveView("sales")}
            >
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <History className="h-10 w-10 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold mb-2">Mis Ventas</h3>
                <p className="text-muted-foreground text-sm">
                  Ver ventas recientes y reimprimir tickets
                </p>
                <Button className="mt-4 w-full bg-transparent" variant="outline">
                  Ver Ventas
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  // Show sales view
  if (activeView === "sales") {
    return (
      <div className="min-h-screen bg-muted/30">
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
                  <h1 className="font-bold text-lg text-primary">Mis Ventas</h1>
                  <p className="text-xs text-muted-foreground">{user?.full_name}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={loadSales}>
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
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Ventas Recientes
              </CardTitle>
              <CardDescription>
                Ultimas 50 ventas realizadas por ti
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : sales.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tienes ventas registradas</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Metodo</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell className="font-mono font-bold">
                            #{sale.id.slice(-8).toUpperCase()}
                          </TableCell>
                          <TableCell>
                            {formatDate(sale.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sale.payment_method === "efectivo" ? "secondary" : "default"}>
                              {sale.payment_method === "efectivo" ? "Efectivo" : "Tarjeta"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary">
                            ${sale.total_amount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openSaleDetails(sale)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Ver
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </main>

        {/* Sale Details Dialog */}
        <Dialog open={isSaleDetailsOpen} onOpenChange={setIsSaleDetailsOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Detalle de Venta
              </DialogTitle>
              <DialogDescription>
                Ticket #{selectedSale?.id.slice(-8).toUpperCase()}
              </DialogDescription>
            </DialogHeader>

            {selectedSale && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Fecha</p>
                    <p className="font-medium">{formatDate(selectedSale.created_at)}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">Metodo de Pago</p>
                    <p className="font-medium capitalize">{selectedSale.payment_method}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Productos</p>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {selectedSale.items?.map((item: any) => (
                      <div key={item.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <div>
                          <span className="text-sm font-medium">{item.quantity}x </span>
                          <span className="text-sm">{item.product?.name || "Producto"}</span>
                          {item.product?.section && (
                            <span className="text-xs text-muted-foreground ml-2">(Sec: {item.product.section})</span>
                          )}
                        </div>
                        <span className="text-sm font-medium">${item.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>${selectedSale.subtotal_before_discount.toFixed(2)}</span>
                  </div>
                  {selectedSale.discount_value > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Descuento ({selectedSale.discount_reason})</span>
                      <span>-${(selectedSale.subtotal_before_discount - selectedSale.total_amount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span className="text-primary">${selectedSale.total_amount.toFixed(2)}</span>
                  </div>
                  {selectedSale.payment_method === "efectivo" && selectedSale.cash_received && (
                    <>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Recibido</span>
                        <span>${selectedSale.cash_received.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Cambio</span>
                        <span>${(selectedSale.change_given || 0).toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>

                <Button 
                  className="w-full" 
                  onClick={() => reprintReceipt(selectedSale)}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Reimprimir Ticket
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Show inventory view - SOLO foto y seccion
  if (activeView === "inventory") {
    return (
      <div className="min-h-screen bg-muted/30">
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
                    {filteredProducts.length} productos encontrados - Solo puedes editar foto y seccion
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Solo foto y seccion
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
                        <TableHead>Imagen</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Seccion</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.slice(0, 50).map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            {product.image_url ? (
                              <Image
                                src={product.image_url || "/placeholder.svg"}
                                alt={product.name}
                                width={40}
                                height={40}
                                className="rounded object-cover"
                              />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              {product.barcode && (
                                <p className="text-xs text-muted-foreground">{product.barcode}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {product.section ? (
                              <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                <MapPin className="h-3 w-3" />
                                {product.section}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">Sin seccion</span>
                            )}
                          </TableCell>
                          <TableCell>{product.category || "-"}</TableCell>
                          <TableCell className="text-right font-medium">
                            ${product.price.toFixed(2)}
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

        {/* Edit Product Dialog - SOLO foto y seccion */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Editar Producto
              </DialogTitle>
              <DialogDescription>
                Solo puedes modificar la imagen y la seccion del producto.
              </DialogDescription>
            </DialogHeader>
            
            {editingProduct && (
              <div className="py-4">
                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <p className="font-medium">{editingProduct.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {editingProduct.barcode && `Codigo: ${editingProduct.barcode} | `}
                    Precio: ${editingProduct.price.toFixed(2)}
                  </p>
                </div>

                <form onSubmit={handleSaveProduct} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-section" className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      Seccion
                    </Label>
                    <Input
                      id="edit-section"
                      value={editFormData.section}
                      onChange={(e) => setEditFormData({ ...editFormData, section: e.target.value.toUpperCase() })}
                      placeholder="Ej: A1, B2, C3"
                      className="uppercase"
                    />
                    <p className="text-xs text-muted-foreground">
                      Indica la ubicacion del producto en la farmacia
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Imagen del Producto
                    </Label>
                    <ImageUpload
                      value={editFormData.image_url}
                      onChange={(url) => setEditFormData({ ...editFormData, image_url: url })}
                    />
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
              </div>
            )}
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
              {/* Sound toggle */}
              <Button
                variant={soundEnabled ? "default" : "outline"}
                size="icon"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? "Desactivar sonido" : "Activar sonido"}
              >
                {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </Button>

              {/* New order alert */}
              {hasNewOrder && (
                <Button 
                  variant="destructive" 
                  className="animate-pulse"
                  onClick={() => {
                    setActiveTab("pending")
                    setHasNewOrder(false)
                  }}
                >
                  <BellRing className="h-4 w-4 mr-2" />
                  Nuevo Pedido!
                </Button>
              )}

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
          <Card className={`bg-yellow-50 border-yellow-200 ${orderCounts.pending > 0 ? "ring-2 ring-yellow-400 animate-pulse" : ""}`}>
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
