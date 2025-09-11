"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ShoppingCart,
  Scan,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Receipt,
  LogOut,
  Camera,
  Keyboard,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { InstallPrompt } from "@/components/install-prompt"

interface Product {
  id: string
  name: string
  price: number
  stock_quantity: number
  barcode?: string
  image_url?: string
}

interface CartItem {
  product: Product
  quantity: number
  subtotal: number
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [barcodeInput, setBarcodeInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<"efectivo" | "tarjeta">("efectivo")
  const [cashReceived, setCashReceived] = useState("")
  const [processingPayment, setProcessingPayment] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false)
  const [scannerMode, setScannerMode] = useState<"camera" | "manual">("manual")
  const [isScanning, setIsScanning] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const supabase = createClient()

  const total = cart.reduce((sum, item) => sum + item.subtotal, 0)
  const change = paymentMethod === "efectivo" ? Math.max(0, Number.parseFloat(cashReceived || "0") - total) : 0

  useEffect(() => {
    checkAuth()
    loadProducts()

    const handleKeyDown = (e: KeyboardEvent) => {
      // Si no hay ningún input enfocado y se presiona una tecla, enfocar el input de código de barras
      if (document.activeElement?.tagName !== "INPUT" && e.key.match(/[0-9a-zA-Z]/)) {
        barcodeInputRef.current?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  const startCamera = async () => {
    try {
      setIsScanning(true)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment", // Usar cámara trasera si está disponible
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
    } catch (error) {
      console.error("Error accessing camera:", error)
      alert("No se pudo acceder a la cámara. Usa el modo manual.")
      setScannerMode("manual")
      setIsScanning(false)
    }
  }

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    setIsScanning(false)
  }

  useEffect(() => {
    if (isQRScannerOpen && scannerMode === "camera") {
      startCamera()
    } else {
      stopCamera()
    }

    return () => stopCamera()
  }, [isQRScannerOpen, scannerMode])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push("/auth/login")
      return
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single()

    if (!profile?.is_active) {
      alert("Tu cuenta está desactivada")
      await supabase.auth.signOut()
      router.push("/auth/login")
      return
    }

    setCurrentUser(profile)
  }

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, stock_quantity, barcode, image_url")
        .eq("is_active", true)
        .gt("stock_quantity", 0)
        .order("name")

      if (error) throw error
      setProducts(data || [])
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleBarcodeSearch = () => {
    if (!barcodeInput.trim()) return

    console.log("[v0] Buscando producto con código:", barcodeInput.trim())

    const product = products.find((p) => p.barcode === barcodeInput.trim())
    if (product) {
      console.log("[v0] Producto encontrado:", product.name)
      addToCart(product)
      setBarcodeInput("")
      if (isQRScannerOpen) {
        setIsQRScannerOpen(false)
      }
    } else {
      console.log("[v0] Producto no encontrado para código:", barcodeInput.trim())
      alert("Producto no encontrado con ese código")
    }
  }

  const addToCart = (product: Product) => {
    const existingItem = cart.find((item) => item.product.id === product.id)

    if (existingItem) {
      if (existingItem.quantity >= product.stock_quantity) {
        alert("No hay suficiente stock")
        return
      }
      updateQuantity(product.id, existingItem.quantity + 1)
    } else {
      const newItem: CartItem = {
        product,
        quantity: 1,
        subtotal: product.price,
      }
      setCart([...cart, newItem])
    }
  }

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromCart(productId)
      return
    }

    const product = products.find((p) => p.id === productId)
    if (product && newQuantity > product.stock_quantity) {
      alert("No hay suficiente stock")
      return
    }

    setCart(
      cart.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: newQuantity, subtotal: item.product.price * newQuantity }
          : item,
      ),
    )
  }

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((item) => item.product.id !== productId))
  }

  const clearCart = () => {
    setCart([])
  }

  const sendSaleNotification = async (saleData: any) => {
    if ("serviceWorker" in navigator && "Notification" in window) {
      const permission = await Notification.requestPermission()
      if (permission === "granted") {
        new Notification("Nueva Venta Registrada", {
          body: `Venta por $${saleData.total_amount.toFixed(2)} - ${saleData.payment_method}`,
          icon: "/icon-192.jpg",
          badge: "/icon-192.jpg",
        })
      }
    }
  }

  const handlePayment = async () => {
    if (cart.length === 0) return

    if (paymentMethod === "efectivo") {
      const received = Number.parseFloat(cashReceived)
      if (isNaN(received) || received < total) {
        alert("El monto recibido debe ser mayor o igual al total")
        return
      }
    }

    setProcessingPayment(true)

    try {
      // Create sale record
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert([
          {
            cashier_id: currentUser.id,
            total_amount: total,
            payment_method: paymentMethod,
            cash_received: paymentMethod === "efectivo" ? Number.parseFloat(cashReceived) : null,
            change_given: paymentMethod === "efectivo" ? change : null,
            status: "completed",
          },
        ])
        .select()
        .single()

      if (saleError) throw saleError

      // Create sale items
      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.subtotal,
      }))

      const { error: itemsError } = await supabase.from("sale_items").insert(saleItems)

      if (itemsError) throw itemsError

      // Update stock quantities
      for (const item of cart) {
        const { error: stockError } = await supabase
          .from("products")
          .update({
            stock_quantity: item.product.stock_quantity - item.quantity,
          })
          .eq("id", item.product.id)

        if (stockError) throw stockError

        // Record stock movement
        await supabase.from("stock_movements").insert([
          {
            product_id: item.product.id,
            movement_type: "salida",
            quantity: -item.quantity,
            reason: `Venta #${sale.id}`,
            user_id: currentUser.id,
          },
        ])
      }

      // Send notification of sale
      await sendSaleNotification(sale)

      // Generate receipt
      generateReceipt(sale, cart)

      // Clear cart and close dialog
      clearCart()
      setIsPaymentDialogOpen(false)
      setCashReceived("")
      setPaymentMethod("efectivo")

      // Reload products to update stock
      loadProducts()

      alert("Venta procesada exitosamente")
    } catch (error) {
      console.error("Error processing payment:", error)
      alert("Error al procesar el pago")
    } finally {
      setProcessingPayment(false)
    }
  }

  const generateReceipt = (sale: any, items: CartItem[]) => {
    const receiptContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Ticket de Venta - Farmacia Solidaria</title>
    <style>
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 13px;
            margin: 0; 
            padding: 0;
            width: 55mm; /* exactamente 5.5 cm */
            background: white;
            color: #000;
            line-height: 1.4;
        }
        .content {
            width: 55mm; /* usar todo el ancho, sin márgenes */
        }
        .header { 
            text-align: center; 
            border-bottom: 1px dashed #000; 
            padding-bottom: 5px; 
            margin-bottom: 5px;
        }
        .logo-text { 
            font-size: 15px; 
            font-weight: bold; 
            margin-bottom: 2px;
        }
        .subtitle { 
            font-size: 11px; 
            margin-bottom: 5px;
        }
        .info-line { 
            display: flex; 
            justify-content: space-between; 
            margin: 2px 0;
            font-size: 12px;
        }
        .items { 
            margin: 8px 0; 
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 5px 0;
        }
        .item { 
            margin: 3px 0; 
        }
        .item-name { 
            font-weight: bold; 
        }
        .item-details { 
            font-size: 12px;
        }
        .total-section { 
            margin-top: 8px; 
            border-top: 1px dashed #000;
            padding-top: 5px;
        }
        .total { 
            font-size: 15px; 
            font-weight: bold; 
            text-align: center;
            margin: 5px 0;
        }
        .payment-info { 
            margin: 8px 0;
            font-size: 12px;
        }
        .footer { 
            text-align: center; 
            margin-top: 10px; 
            border-top: 1px dashed #000;
            padding-top: 5px;
            font-size: 11px;
        }
        .thank-you { 
            font-size: 13px; 
            font-weight: bold; 
            margin: 5px 0;
        }
        .footer-logo {
            margin-top: 10px;
            text-align: center;
        }
        .footer-logo img {
            width: 55mm; /* ocupa todo el ancho del ticket */
            height: auto;
            display: block;
        }
        @media print {
            body { margin: 0; padding: 0; width: 55mm; }
            .content { width: 55mm; }
        }
    </style>
</head>
<body>
    <div class="content">
        <div class="header">
            <div class="logo-text">FARMACIA SOLIDARIA</div>
            <div class="subtitle">Cuidando la salud de nuestra comunidad</div>
            <div style="font-size: 10px;">
                Dirección: Calle Principal #123<br>
                Tel: (555) 123-4567<br>
                www.farmaciasolidaria.com
            </div>
        </div>

        <div class="info-line">
            <span>Fecha:</span>
            <span>${new Date().toLocaleString("es-ES")}</span>
        </div>
        <div class="info-line">
            <span>Cajero:</span>
            <span>${currentUser.full_name}</span>
        </div>
        <div class="info-line">
            <span>Ticket #:</span>
            <span>${sale.id.slice(-8).toUpperCase()}</span>
        </div>

        <div class="items">
            <div style="font-weight: bold; text-align: center; margin-bottom: 5px;">
                PRODUCTOS VENDIDOS
            </div>
            ${items
              .map(
                (item) => `
            <div class="item">
                <div class="item-name">${item.product.name}</div>
                <div class="item-details">
                    ${item.quantity} x $${item.product.price.toFixed(2)} = $${item.subtotal.toFixed(2)}
                </div>
            </div>`,
              )
              .join("")}
        </div>

        <div class="total-section">
            <div class="info-line">
                <span>Subtotal:</span>
                <span>$${total.toFixed(2)}</span>
            </div>
            <div class="info-line">
                <span>Impuestos:</span>
                <span>$0.00</span>
            </div>
            <div class="total">
                TOTAL: $${total.toFixed(2)}
            </div>
        </div>

        <div class="payment-info">
            <div class="info-line">
                <span>Método de pago:</span>
                <span>${paymentMethod === "efectivo" ? "EFECTIVO" : "TARJETA"}</span>
            </div>
            ${
              paymentMethod === "efectivo"
                ? `
            <div class="info-line">
                <span>Recibido:</span>
                <span>$${Number.parseFloat(cashReceived).toFixed(2)}</span>
            </div>
            <div class="info-line">
                <span>Cambio:</span>
                <span>$${change.toFixed(2)}</span>
            </div>`
                : ""
            }
        </div>

        <div class="footer">
            <div class="thank-you">¡Gracias por su compra!</div>
            <div>
                Conserve este ticket<br>
                Cambios y devoluciones: 30 días<br>
                ¡Que tenga un excelente día!
            </div>
            <div style="margin-top: 8px; font-size: 10px;">
                Ticket generado el ${new Date().toLocaleString("es-ES")}<br>
                Sistema POS - Farmacia Solidaria v1.0
            </div>

            <!-- Logo al final -->
            <div class="footer-logo">
                <img src="/solidaria.jpg" alt="Logo Solidaria Salud" />
            </div>
        </div>
    </div>
</body>
</html>



    `

    // Create a new window for printing
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const filteredProducts = products.filter((product) => product.name.toLowerCase().includes(searchTerm.toLowerCase()))

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando punto de venta...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-green-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-gradient-to-r from-purple-600 to-green-600 rounded-xl">
              <ShoppingCart className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-green-600 bg-clip-text text-transparent">
                Farmacia Solidaria
              </h1>
              <p className="text-sm text-muted-foreground">
                ¡Bienvenido/a {currentUser?.full_name}! 💊 Listo para ayudar
              </p>
            </div>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="border-purple-200 hover:bg-purple-50 bg-transparent"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-5rem)]">
        {/* Products Section */}
        <div className="flex-1 p-6 space-y-6 overflow-auto">
          {/* Welcome Message */}
          <Card className="bg-gradient-to-r from-purple-500 to-green-500 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-full">
                  <ShoppingCart className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">¡Hola {currentUser?.full_name}! 👋</h2>
                  <p className="text-purple-100">Estamos aquí para cuidar la salud de nuestra comunidad</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Barcode Scanner */}
          <Card className="border-purple-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-green-50">
              <CardTitle className="flex items-center gap-2 text-purple-700">
                <Scan className="h-5 w-5" />
                Escáner de Código de Barras / QR
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    ref={barcodeInputRef}
                    placeholder="Escanea o ingresa código de barras..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleBarcodeSearch()}
                    className="border-purple-200 focus:border-purple-400"
                    autoFocus
                  />
                  <Button
                    onClick={handleBarcodeSearch}
                    className="bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700"
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  onClick={() => setIsQRScannerOpen(true)}
                  variant="outline"
                  className="w-full border-green-200 text-green-700 hover:bg-green-50"
                >
                  📷 Abrir Escáner QR Avanzado
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  💡 Tip: Los escáneres físicos funcionan automáticamente en el campo de arriba
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Product Search */}
          <Card className="border-green-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-green-50 to-purple-50">
              <CardTitle className="text-green-700">Buscar Medicamentos</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Input
                placeholder="Buscar por nombre del medicamento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-green-200 focus:border-green-400"
              />
            </CardContent>
          </Card>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 border-0 shadow-lg bg-white/80 backdrop-blur-sm"
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="w-full h-32 bg-gradient-to-br from-purple-100 to-green-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url || "/placeholder.svg"}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <div className="w-16 h-16 bg-gradient-to-r from-purple-400 to-green-400 rounded-full flex items-center justify-center mx-auto mb-2">
                            <span className="text-2xl">💊</span>
                          </div>
                          <span className="text-xs text-muted-foreground">Sin imagen</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-lg text-gray-800 line-clamp-2">{product.name}</h3>
                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-green-600 bg-clip-text text-transparent">
                          ${product.price.toFixed(2)}
                        </span>
                        <Badge
                          variant={
                            product.stock_quantity > 10
                              ? "default"
                              : product.stock_quantity > 0
                                ? "secondary"
                                : "destructive"
                          }
                          className="font-semibold"
                        >
                          Stock: {product.stock_quantity}
                        </Badge>
                      </div>
                      <Button
                        onClick={() => addToCart(product)}
                        className="w-full bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700 text-white font-semibold py-3"
                        disabled={product.stock_quantity === 0}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {product.stock_quantity === 0 ? "Sin Stock" : "Agregar al Carrito"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Cart Section */}
        <div className="w-96 border-l bg-white/90 backdrop-blur-sm p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-green-600 bg-clip-text text-transparent">
              🛒 Carrito de Compras
            </h2>
            {cart.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCart}
                className="border-red-200 text-red-600 hover:bg-red-50 bg-transparent"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Cart Items */}
          <div className="space-y-3 flex-1 overflow-auto max-h-96">
            {cart.map((item) => (
              <Card key={item.product.id} className="border-purple-100 shadow-md">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-800">{item.product.name}</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-purple-600">${item.product.price.toFixed(2)}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="h-8 w-8 p-0 border-purple-200"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="h-8 w-8 p-0 border-purple-200"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg text-green-600">${item.subtotal.toFixed(2)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {cart.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg">El carrito está vacío</p>
              <p className="text-sm">Agrega productos para comenzar</p>
            </div>
          )}

          {/* Total and Payment */}
          {cart.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total a pagar</p>
                <div className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-green-600 bg-clip-text text-transparent">
                  ${total.toFixed(2)}
                </div>
              </div>
              <Button
                onClick={() => setIsPaymentDialogOpen(true)}
                className="w-full bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700 text-white font-bold py-4 text-lg"
                size="lg"
              >
                <Receipt className="h-5 w-5 mr-2" />💳 Procesar Pago
              </Button>
            </div>
          )}
        </div>
      </div>

      <InstallPrompt />

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="border-purple-200">
          <DialogHeader>
            <DialogTitle className="text-xl bg-gradient-to-r from-purple-600 to-green-600 bg-clip-text text-transparent">
              💳 Procesar Pago
            </DialogTitle>
            <DialogDescription className="text-lg font-semibold">
              Total a cobrar: <span className="text-green-600">${total.toFixed(2)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-base font-semibold">Método de pago</Label>
              <Select value={paymentMethod} onValueChange={(value: "efectivo" | "tarjeta") => setPaymentMethod(value)}>
                <SelectTrigger className="border-purple-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-green-600" />💵 Efectivo
                    </div>
                  </SelectItem>
                  <SelectItem value="tarjeta">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-purple-600" />💳 Tarjeta
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === "efectivo" && (
              <div className="space-y-2">
                <Label htmlFor="cashReceived" className="text-base font-semibold">
                  Monto recibido
                </Label>
                <Input
                  id="cashReceived"
                  type="number"
                  step="0.01"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0.00"
                  className="border-green-200 focus:border-green-400 text-lg"
                />
                {cashReceived && Number.parseFloat(cashReceived) >= total && (
                  <div className="text-xl font-bold text-green-600 bg-green-50 p-3 rounded-lg text-center">
                    💰 Cambio: ${change.toFixed(2)}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} className="border-gray-300">
              Cancelar
            </Button>
            <Button
              onClick={handlePayment}
              disabled={
                processingPayment ||
                (paymentMethod === "efectivo" && (!cashReceived || Number.parseFloat(cashReceived) < total))
              }
              className="bg-gradient-to-r from-purple-600 to-green-600 hover:from-purple-700 hover:to-green-700 text-white font-bold"
            >
              {processingPayment ? "Procesando... ⏳" : "✅ Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Scanner Dialog */}
      <Dialog
        open={isQRScannerOpen}
        onOpenChange={(open) => {
          setIsQRScannerOpen(open)
          if (!open) {
            stopCamera()
            setScannerMode("manual")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">📷 Escáner QR Avanzado</DialogTitle>
            <DialogDescription>
              {scannerMode === "camera"
                ? "Apunta la cámara hacia el código QR"
                : "Ingresa el código manualmente o usa la cámara"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant={scannerMode === "manual" ? "default" : "outline"}
                onClick={() => setScannerMode("manual")}
                className="flex-1"
              >
                <Keyboard className="h-4 w-4 mr-2" />
                Manual
              </Button>
              <Button
                variant={scannerMode === "camera" ? "default" : "outline"}
                onClick={() => setScannerMode("camera")}
                className="flex-1"
              >
                <Camera className="h-4 w-4 mr-2" />
                Cámara
              </Button>
            </div>

            {scannerMode === "camera" ? (
              <div className="space-y-3">
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 relative">
                  {isScanning ? (
                    <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center text-gray-500">
                        <Camera className="h-16 w-16 mx-auto mb-2" />
                        <p className="text-sm">Presiona "Iniciar Cámara"</p>
                      </div>
                    </div>
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                {!isScanning ? (
                  <Button onClick={startCamera} className="w-full">
                    <Camera className="h-4 w-4 mr-2" />
                    Iniciar Cámara
                  </Button>
                ) : (
                  <Button onClick={stopCamera} variant="outline" className="w-full bg-transparent">
                    Detener Cámara
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  📱 Funciona mejor en dispositivos móviles con cámara trasera
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                  <div className="text-center text-gray-500">
                    <Scan className="h-16 w-16 mx-auto mb-2" />
                    <p className="text-sm">Modo Manual</p>
                    <p className="text-xs mt-2">
                      🖨️ Perfecto para escáneres físicos
                      <br />📱 También funciona con códigos QR
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Código QR o Código de Barras:</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ingresa o escanea el código..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          handleBarcodeSearch()
                          setIsQRScannerOpen(false)
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      onClick={() => {
                        handleBarcodeSearch()
                        setIsQRScannerOpen(false)
                      }}
                      size="sm"
                    >
                      ✅
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQRScannerOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
