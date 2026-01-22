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
  Percent,
  Tag,
  Printer,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { useRouter } from "next/navigation"
import { InstallPrompt } from "@/components/install-prompt"

const PRODUCTS_PER_PAGE = 30

interface Product {
  id: string
  name: string
  price: number
  stock_quantity: number
  barcode?: string
  image_url?: string
  is_active: boolean
  section?: string
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
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage")
  const [discountValue, setDiscountValue] = useState("")
  const [boxBalance, setBoxBalance] = useState(500)
  const [currentPage, setCurrentPage] = useState(1)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const [includeStockBajo, setIncludeStockBajo] = useState(true)
  const [includePorVencer, setIncludePorVencer] = useState(true)
  const [includeVencidos, setIncludeVencidos] = useState(true)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  const router = useRouter()
  const supabase = createClient()

  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0)

  const calculateDiscount = () => {
    const value = Number.parseFloat(discountValue || "0")
    if (value <= 0) return 0

    if (discountType === "percentage") {
      return (subtotal * value) / 100
    }
    return value
  }

  const discountAmount = calculateDiscount()
  const total = Math.max(0, subtotal - discountAmount)

  const change = paymentMethod === "efectivo" ? Math.max(0, Number.parseFloat(cashReceived || "0") - total) : 0

  useEffect(() => {
    checkAuth()
    loadProducts()

    const handleKeyDown = (e: KeyboardEvent) => {
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
          facingMode: "environment",
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
      const response = await fetch("/api/products")
      const { products: data, total } = await response.json()

      console.log("[v0] Total products loaded from API:", total)

      const activeProducts = data.filter((p: any) => p.is_active !== false)
      setProducts(activeProducts)
      setCurrentPage(1)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleBarcodeSearch = async () => {
    if (!barcodeInput.trim()) return

    const product = products.find((p) => p.barcode === barcodeInput.trim())

    if (!product) {
      alert("❌ Producto no encontrado")
      setBarcodeInput("")
      return
    }

    if (product) {
      addToCart(product)
      setBarcodeInput("")
      if (isQRScannerOpen) {
        setIsQRScannerOpen(false)
      }
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
    setDiscountValue("")
    setDiscountType("percentage")
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
      const discountValueNum = Number.parseFloat(discountValue || "0")
      const hasDiscount = discountValueNum > 0

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert([
          {
            cashier_id: currentUser.id,
            subtotal_before_discount: subtotal,
            discount_type: hasDiscount ? discountType : "none",
            discount_value: hasDiscount ? discountValueNum : 0,
            discount_reason: hasDiscount
              ? `Descuento ${discountType === "percentage" ? `${discountValueNum}%` : `$${discountValueNum}`}`
              : null,
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

      const saleItems = cart.map((item) => ({
        sale_id: sale.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.subtotal,
      }))

      const { error: itemsError } = await supabase.from("sale_items").insert(saleItems)

      if (itemsError) throw itemsError

      for (const item of cart) {
        const { error: stockError } = await supabase
          .from("products")
          .update({
            stock_quantity: item.product.stock_quantity - item.quantity,
          })
          .eq("id", item.product.id)

        if (stockError) throw stockError

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

      const discountReasonText = hasDiscount
        ? `Descuento ${discountType === "percentage" ? `${discountValueNum}%` : `$${discountValueNum}`}`
        : ""
      generateReceipt(sale, cart, discountAmount, discountReasonText, subtotal, total, cashReceived, change)

      clearCart()
      setIsPaymentDialogOpen(false)
      setCashReceived("")
      setPaymentMethod("efectivo")

      loadProducts()
    } catch (error) {
      console.error("Error processing payment:", error)
      alert("Error al procesar el pago")
    } finally {
      setProcessingPayment(false)
    }
  }

  const generateReceipt = (
    sale: any,
    items: CartItem[],
    discount: number,
    discountReason: string,
    localSubtotal: number,
    localTotal: number,
    localCashReceived: string,
    localChange: number,
  ) => {
    const receiptContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Ticket de Venta - Farmacia Bienestar</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body { 
            font-family: 'Courier New', monospace; 
            font-size: 13px;
            margin: 0 !important; 
            padding: 0 !important;
            width: 55mm;
            max-width: 55mm;
            background: white;
            color: #000;
            line-height: 1.4;
        }
        .content {
            width: 100%;
            max-width: 55mm;
            margin: 0;
            padding: 2mm;
            box-sizing: border-box;
        }
        .center {
            text-align: center;
            margin-bottom: 5px;
            width: 100%;
        }
        .title {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 5px;
            width: 100%;
        }
        .line {
            border-bottom: 1px solid #000;
            margin: 8px 0;
            width: 100%;
        }
        .dashed-line {
            border-bottom: 1px dashed #000;
            margin: 5px 0;
            width: 100%;
        }
        .row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-size: 12px;
            width: 100%;
        }
        .item-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1px;
            font-size: 11px;
            width: 100%;
        }
        .right-align {
            text-align: right;
        }
        .bold {
            font-weight: bold;
        }
        .small {
            font-size: 10px;
        }
        .discount {
            color: #000;
        }
        @media print {
            * {
                margin: 0 !important;
                padding: 0 !important;
            }
            html, body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 55mm !important;
                max-width: 55mm !important;
            }
            .content { 
                width: 55mm !important;
                max-width: 55mm !important;
                margin: 0 !important;
                padding: 2mm !important;
                box-sizing: border-box !important;
            }
            @page {
                size: 55mm auto;
                margin: 0 !important;
            }
        }
    </style>
</head>
<body>
    <div class="content">
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
            <span>${new Date().toLocaleDateString("es-ES")}</span>
        </div>
        <div class="row">
            <span>HORA:</span>
            <span>${new Date().toLocaleTimeString("es-ES", { hour12: false })}</span>
        </div>
        <div class="row">
            <span>CAJERO:</span>
            <span>${currentUser.full_name}</span>
        </div>
        
        <div class="line"></div>
        
        <div class="center small bold">PRODUCTOS</div>
        
        ${items
          .map(
            (item) => `
        <div class="item-row">
            <span>${item.product.name}</span>
            <span></span>
        </div>
        ${item.product.section ? `<div class="item-row"><span>  Sec: ${item.product.section}</span><span></span></div>` : ""}
        <div class="item-row">
            <span>  ${item.quantity} x $${item.product.price.toFixed(2)}</span>
            <span class="right-align">$${item.subtotal.toFixed(2)}</span>
        </div>
        `,
          )
          .join("")}
        
        <div class="dashed-line"></div>
        
        <div class="row">
            <span>SUBTOTAL:</span>
            <span class="right-align">$${localSubtotal.toFixed(2)}</span>
        </div>
        ${
          discount > 0
            ? `
        <div class="row discount">
            <span>DESCUENTO (${discountReason}):</span>
            <span class="right-align">-$${discount.toFixed(2)}</span>
        </div>
        `
            : ""
        }
        <div class="row bold">
            <span>TOTAL:</span>
            <span class="right-align">$${localTotal.toFixed(2)}</span>
        </div>
        ${
          discount > 0
            ? `
        <div class="center small" style="margin-top: 3px;">
            Ahorraste $${discount.toFixed(2)}
        </div>
        `
            : ""
        }
        
        <div class="dashed-line"></div>
        
        <div class="row">
            <span>PAGO:</span>
            <span class="right-align">${sale.payment_method === "efectivo" ? "EFECTIVO" : "TARJETA"}</span>
        </div>
        ${
          sale.payment_method === "efectivo"
            ? `
        <div class="row">
            <span>RECIBIDO:</span>
            <span class="right-align">$${Number.parseFloat(localCashReceived || "0").toFixed(2)}</span>
        </div>
        <div class="row bold">
            <span>CAMBIO:</span>
            <span class="right-align">$${localChange.toFixed(2)}</span>
        </div>
        `
            : ""
        }
        
        <div class="line"></div>
        
        <div class="center small" style="margin-top: 10px;">
            <div><strong>¡GRACIAS POR SU COMPRA!</strong></div>
            <div>Conserve su ticket</div>
            <div>Cambios y devoluciones: 30 dias</div>
            <div style="margin-top: 8px; font-size: 9px;">
                ${new Date().toLocaleString("es-ES")}<br>
                Sistema POS - Farmacia Bienestar v1.0
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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  // Export inventory functions
  const getExpirationStatus = (product: Product & { min_stock_level?: number; expiration_date?: string; days_before_expiry_alert?: number }) => {
    if (!product.expiration_date) return null

    const today = new Date()
    const expirationDate = new Date(product.expiration_date)
    const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const alertThreshold = product.days_before_expiry_alert || 30

    if (daysUntilExpiry < 0) {
      return { status: "expired", days: Math.abs(daysUntilExpiry), variant: "destructive" as const }
    } else if (daysUntilExpiry <= alertThreshold) {
      return { status: "expiring", days: daysUntilExpiry, variant: "warning" as const }
    }
    return null
  }

  const getUniqueSections = () => {
    const sections = new Set<string>()
    products.forEach((product) => {
      sections.add(product.section || "SIN SECCION")
    })
    return Array.from(sections).sort()
  }

  const toggleSection = (section: string) => {
    setSelectedSections((prev) => (prev.includes(section) ? prev.filter((s) => s !== section) : [...prev, section]))
  }

  const selectAllSections = () => {
    setSelectedSections(getUniqueSections())
  }

  const deselectAllSections = () => {
    setSelectedSections([])
  }

  const openExportDialog = () => {
    setSelectedSections(getUniqueSections())
    setIncludeStockBajo(true)
    setIncludePorVencer(true)
    setIncludeVencidos(true)
    setIsExportDialogOpen(true)
  }

  const generateStockReport = () => {
    const filteredBySection = products.filter((product) => {
      const productSection = product.section || "SIN SECCION"
      return selectedSections.includes(productSection)
    })

    const productsBySection = filteredBySection.reduce((acc: Record<string, any[]>, product) => {
      const section = product.section || "SIN SECCION"
      if (!acc[section]) {
        acc[section] = []
      }
      acc[section].push(product)
      return acc
    }, {})

    const sortedSections = Object.keys(productsBySection).sort()

    const pad = (text: string, length: number, align: "left" | "right" = "left") => {
      const str = text.substring(0, length)
      if (align === "right") {
        return str.padStart(length, " ")
      }
      return str.padEnd(length, " ")
    }

    const line = (char = "-") => char.repeat(42)
    const doubleLine = () => "=".repeat(42)
    const center = (text: string) => {
      const padding = Math.max(0, Math.floor((42 - text.length) / 2))
      return " ".repeat(padding) + text
    }

    let receipt = ""

    receipt += center("FARMACIA BIENESTAR") + "\n"
    receipt += center("Tu salud es nuestro compromiso") + "\n"
    receipt += doubleLine() + "\n"
    receipt += center("REPORTE DE INVENTARIO") + "\n"
    receipt += line() + "\n"
    receipt += `Fecha: ${new Date().toLocaleDateString("es-MX")}\n`
    receipt += `Hora: ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}\n`
    receipt += `Cajero: ${currentUser?.full_name || "N/A"}\n`
    receipt += doubleLine() + "\n\n"

    sortedSections.forEach((section) => {
      const sectionProducts = productsBySection[section]

      receipt += center(`[ SECCION ${section} ]`) + "\n"
      receipt += line() + "\n"
      receipt += pad("PRODUCTO", 30) + pad("STK", 6, "right") + pad("PREC", 6, "right") + "\n"
      receipt += line("-") + "\n"

      sectionProducts.forEach((product: any) => {
        const expirationStatus = getExpirationStatus(product)
        let name = product.name.substring(0, 28)
        if (expirationStatus?.status === "expired") {
          name += " *V*"
        } else if (expirationStatus?.status === "expiring") {
          name += " !"
        }
        const minStock = product.min_stock_level || 10
        if (product.stock_quantity <= minStock) {
          name += " <B>"
        }

        receipt += pad(name, 30)
        receipt += pad(product.stock_quantity.toString(), 6, "right")
        receipt += pad("$" + product.price.toFixed(0), 6, "right")
        receipt += "\n"
      })

      receipt += `${pad("Subtotal:", 30)}${pad(sectionProducts.length.toString(), 6, "right")} prod\n`
      receipt += line() + "\n\n"
    })

    if (includeStockBajo) {
      const lowStockProducts = filteredBySection.filter((p: any) => p.stock_quantity <= (p.min_stock_level || 10))
      receipt += center("[ STOCK BAJO ]") + "\n"
      receipt += line() + "\n"
      if (lowStockProducts.length > 0) {
        lowStockProducts.forEach((product: any) => {
          receipt += pad(product.name.substring(0, 26), 28)
          receipt += `[${product.section || "S/S"}]`
          receipt += pad(product.stock_quantity.toString(), 6, "right")
          receipt += "\n"
        })
      } else {
        receipt += center("Ningun producto con stock bajo") + "\n"
      }
      receipt += line() + "\n\n"
    }

    if (includePorVencer) {
      const expiringProducts = filteredBySection.filter((p: any) => {
        const status = getExpirationStatus(p)
        return status && status.status === "expiring"
      })
      receipt += center("[ POR VENCER ]") + "\n"
      receipt += line() + "\n"
      if (expiringProducts.length > 0) {
        expiringProducts.forEach((product: any) => {
          const status = getExpirationStatus(product)
          receipt += pad(product.name.substring(0, 26), 28)
          receipt += `[${product.section || "S/S"}]`
          receipt += pad(`${status?.days}d`, 6, "right")
          receipt += "\n"
        })
      } else {
        receipt += center("Ningun producto por vencer") + "\n"
      }
      receipt += line() + "\n\n"
    }

    if (includeVencidos) {
      const expiredProducts = filteredBySection.filter((p: any) => {
        const status = getExpirationStatus(p)
        return status && status.status === "expired"
      })
      receipt += center("[ VENCIDOS ]") + "\n"
      receipt += line() + "\n"
      if (expiredProducts.length > 0) {
        expiredProducts.forEach((product: any) => {
          receipt += pad(product.name.substring(0, 26), 28)
          receipt += `[${product.section || "S/S"}]`
          receipt += pad("VENCIDO", 8, "right")
          receipt += "\n"
        })
      } else {
        receipt += center("Ningun producto vencido") + "\n"
      }
      receipt += line() + "\n\n"
    }

    receipt += doubleLine() + "\n"
    receipt += center("RESUMEN") + "\n"
    receipt += line() + "\n"
    receipt += `Total productos: ${pad(filteredBySection.length.toString(), 20, "right")}\n`
    receipt += `Secciones: ${pad(sortedSections.length.toString(), 24, "right")}\n`
    receipt += `Stock bajo: ${pad(filteredBySection.filter((p: any) => p.stock_quantity <= (p.min_stock_level || 10)).length.toString(), 23, "right")}\n`
    receipt += `Por vencer: ${pad(
      filteredBySection
        .filter((p: any) => {
          const s = getExpirationStatus(p)
          return s && s.status === "expiring"
        })
        .length.toString(),
      23,
      "right",
    )}\n`
    receipt += `Vencidos: ${pad(
      filteredBySection
        .filter((p: any) => {
          const s = getExpirationStatus(p)
          return s && s.status === "expired"
        })
        .length.toString(),
      25,
      "right",
    )}\n`
    receipt += doubleLine() + "\n"
    receipt += center("Generado: " + new Date().toLocaleString("es-MX")) + "\n"
    receipt += "\n\n\n"

    const printWindow = window.open("", "_blank", "width=400,height=600")
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Inventario - Farmacia Bienestar</title>
            <style>
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                font-family: 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.2;
                margin: 0;
                padding: 5mm;
                width: 80mm;
                max-width: 80mm;
                background: white;
                color: black;
              }
              pre {
                margin: 0;
                white-space: pre-wrap;
                word-wrap: break-word;
                font-family: 'Courier New', monospace;
                font-size: 12px;
              }
              @media print {
                body { width: 80mm; max-width: 80mm; }
              }
            </style>
          </head>
          <body>
            <pre>${receipt}</pre>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }

    setIsExportDialogOpen(false)
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE
  const endIndex = startIndex + PRODUCTS_PER_PAGE
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando punto de venta...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-red-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm shadow-sm">
        <div className="flex h-20 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-gradient-to-r from-rose-800 to-red-900 rounded-xl">
              <ShoppingCart className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-rose-800 to-red-900 bg-clip-text text-transparent">
                Farmacia Bienestar
              </h1>
              <p className="text-sm text-muted-foreground">¡Bienvenido/a {currentUser?.full_name}! Listo para ayudar</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={openExportDialog} variant="outline" className="border-rose-200 hover:bg-rose-50 bg-transparent">
              <Printer className="h-4 w-4 mr-2" />
              Exportar Inventario
            </Button>
            <Button onClick={handleLogout} variant="outline" className="border-rose-200 hover:bg-rose-50 bg-transparent">
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-5rem)]">
        {/* Products Section */}
        <div className="flex-1 p-6 space-y-6 overflow-auto">
          <Card className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-full">
                    <Banknote className="h-8 w-8" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">Saldo de Caja</h2>
                    <p className="text-blue-100 text-sm">Dinero inicial disponible</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-blue-100">Efectivo disponible:</p>
                  <p className="text-4xl font-bold">${boxBalance.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Welcome Message */}
          <Card className="bg-gradient-to-r from-rose-800 to-red-900 text-white border-0">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-full">
                  <ShoppingCart className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">¡Hola {currentUser?.full_name}!</h2>
                  <p className="text-rose-100">Tu salud es nuestro compromiso</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Barcode Scanner */}
          <Card className="border-rose-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-rose-50 to-red-50">
              <CardTitle className="flex items-center gap-2 text-rose-900">
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
                    className="border-rose-200 focus:border-rose-400"
                    autoFocus
                  />
                  <Button
                    onClick={handleBarcodeSearch}
                    className="bg-gradient-to-r from-rose-800 to-red-900 hover:from-rose-900 hover:to-red-950"
                  >
                    <Scan className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  onClick={() => setIsQRScannerOpen(true)}
                  variant="outline"
                  className="w-full border-rose-200 text-rose-800 hover:bg-rose-50"
                >
                  Abrir Escáner QR Avanzado
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Tip: Si el producto no existe en activos, te mostrará si está en eliminados
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Product Search */}
          <Card className="border-rose-200 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-rose-50 to-red-50">
              <CardTitle className="text-rose-900">Buscar Medicamentos</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <Input
                placeholder="Buscar por nombre del medicamento..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                }}
                className="border-rose-200 focus:border-rose-400"
              />
            </CardContent>
          </Card>

          <div className="text-sm text-muted-foreground bg-white/80 backdrop-blur-sm p-3 rounded-lg">
            Mostrando {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} de {filteredProducts.length}{" "}
            productos
            {searchTerm && ` (filtrados de ${products.length} totales)`}
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 border-0 shadow-lg bg-white/80 backdrop-blur-sm"
              >
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="w-full h-32 bg-gradient-to-br from-rose-100 to-red-100 rounded-lg flex items-center justify-center overflow-hidden">
                      {product.image_url ? (
                        <img
                          src={product.image_url || "/placeholder.svg"}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <div className="w-16 h-16 bg-gradient-to-r from-rose-600 to-red-700 rounded-full flex items-center justify-center mx-auto mb-2">
                            <span className="text-2xl">💊</span>
                          </div>
                          <span className="text-xs text-muted-foreground">Sin imagen</span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <h3 className="font-bold text-lg text-gray-800 line-clamp-2">{product.name}</h3>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold bg-gradient-to-r from-rose-800 to-red-900 bg-clip-text text-transparent">
                          ${product.price.toFixed(2)}
                        </span>
                        <div className="flex items-center gap-2">
                          {product.section && (
                            <Badge variant="outline" className="text-xs border-rose-300 text-rose-800 bg-rose-50">
                              {product.section}
                            </Badge>
                          )}
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
                      </div>
                      <Button
                        onClick={() => addToCart(product)}
                        className="w-full bg-gradient-to-r from-rose-800 to-red-900 hover:from-rose-900 hover:to-red-950 text-white font-semibold py-3"
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

          {filteredProducts.length > PRODUCTS_PER_PAGE && (
            <div className="flex flex-col items-center gap-4 mt-6 mb-6">
              <div className="flex justify-center items-center gap-2">
                <Button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  variant="outline"
                  className="bg-white/80 backdrop-blur-sm"
                >
                  Anterior
                </Button>

                <div className="flex gap-2">
                  {/* Show first page */}
                  <Button
                    onClick={() => setCurrentPage(1)}
                    variant={currentPage === 1 ? "default" : "outline"}
                    className={
                      currentPage === 1
                        ? "bg-gradient-to-r from-rose-800 to-red-900 text-white"
                        : "bg-white/80 backdrop-blur-sm"
                    }
                  >
                    1
                  </Button>

                  {/* Show ellipsis if needed */}
                  {currentPage > 3 && <span className="flex items-center px-2">...</span>}

                  {/* Show pages around current page */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => page > 1 && page < totalPages && Math.abs(page - currentPage) <= 1)
                    .map((page) => (
                      <Button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        variant={currentPage === page ? "default" : "outline"}
                        className={
                          currentPage === page
                            ? "bg-gradient-to-r from-rose-800 to-red-900 text-white"
                            : "bg-white/80 backdrop-blur-sm"
                        }
                      >
                        {page}
                      </Button>
                    ))}

                  {/* Show ellipsis if needed */}
                  {currentPage < totalPages - 2 && <span className="flex items-center px-2">...</span>}

                  {/* Show last page */}
                  {totalPages > 1 && (
                    <Button
                      onClick={() => setCurrentPage(totalPages)}
                      variant={currentPage === totalPages ? "default" : "outline"}
                      className={
                        currentPage === totalPages
                          ? "bg-gradient-to-r from-rose-800 to-red-900 text-white"
                          : "bg-white/80 backdrop-blur-sm"
                      }
                    >
                      {totalPages}
                    </Button>
                  )}
                </div>

                <Button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  variant="outline"
                  className="bg-white/80 backdrop-blur-sm"
                >
                  Siguiente
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground bg-white/80 backdrop-blur-sm px-4 py-2 rounded-lg">
                Página {currentPage} de {totalPages}
              </div>
            </div>
          )}
        </div>

        {/* Cart Section */}
        <div className="w-96 border-l bg-white/90 backdrop-blur-sm p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold bg-gradient-to-r from-rose-800 to-red-900 bg-clip-text text-transparent">
              Carrito de Compras
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

          <div className="space-y-3 flex-1 overflow-auto max-h-96">
            {cart.map((item) => (
              <Card key={item.product.id} className="border-rose-100 shadow-md">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <h4 className="font-semibold text-gray-800">{item.product.name}</h4>
                    {item.product.section && (
                      <Badge variant="outline" className="text-xs border-rose-300 text-rose-800">
                        {item.product.section}
                      </Badge>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-rose-800">${item.product.price.toFixed(2)}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="h-8 w-8 p-0 border-rose-200"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center font-bold">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="h-8 w-8 p-0 border-rose-200"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-lg text-rose-800">${item.subtotal.toFixed(2)}</span>
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

          {cart.length > 0 && (
            <div className="space-y-4 border-t pt-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Total a pagar</p>
                <div className="text-3xl font-bold bg-gradient-to-r from-rose-800 to-red-900 bg-clip-text text-transparent">
                  ${total.toFixed(2)}
                </div>
              </div>
              <Button
                onClick={() => setIsPaymentDialogOpen(true)}
                className="w-full bg-gradient-to-r from-rose-800 to-red-900 hover:from-rose-900 hover:to-red-950 text-white font-bold py-4 text-lg"
                size="lg"
              >
                <Receipt className="h-5 w-5 mr-2" />
                Procesar Pago
              </Button>
            </div>
          )}
        </div>
      </div>

      <InstallPrompt />

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="border-rose-200 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl bg-gradient-to-r from-rose-800 to-red-900 bg-clip-text text-transparent">
              Procesar Pago
            </DialogTitle>
            <DialogDescription className="text-lg font-semibold">
              Subtotal: <span className="text-rose-800">${subtotal.toFixed(2)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                  <Tag className="h-4 w-4" />
                  Aplicar Descuento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Tipo</Label>
                    <Select
                      value={discountType}
                      onValueChange={(value: "percentage" | "fixed") => setDiscountType(value)}
                    >
                      <SelectTrigger className="border-orange-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">
                          <div className="flex items-center gap-2">
                            <Percent className="h-3 w-3" />
                            Porcentaje (%)
                          </div>
                        </SelectItem>
                        <SelectItem value="fixed">
                          <div className="flex items-center gap-2">
                            <Tag className="h-3 w-3" />
                            Monto fijo ($)
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Valor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === "percentage" ? "10" : "50.00"}
                      className="border-orange-200"
                    />
                  </div>
                </div>

                {discountAmount > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex justify-between items-center text-green-700 font-semibold">
                      <span>Descuento aplicado:</span>
                      <span className="text-lg">-${discountAmount.toFixed(2)}</span>
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      {discountType === "percentage"
                        ? `${discountValue}% de descuento`
                        : `$${discountValue} de descuento`}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {discountAmount > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                <div className="flex justify-between text-sm text-muted-foreground mb-1">
                  <span>Subtotal:</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-green-600 font-semibold mb-2">
                  <span>Descuento:</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold text-rose-900 border-t border-rose-200 pt-2">
                  <span>Total a pagar:</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-base font-semibold">Método de pago</Label>
              <Select value={paymentMethod} onValueChange={(value: "efectivo" | "tarjeta") => setPaymentMethod(value)}>
                <SelectTrigger className="border-rose-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4 text-green-600" />
                      Efectivo
                    </div>
                  </SelectItem>
                  <SelectItem value="tarjeta">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-rose-800" />
                      Tarjeta
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
                    Cambio: ${change.toFixed(2)}
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
              className="bg-gradient-to-r from-rose-800 to-red-900 hover:from-rose-900 hover:to-red-950 text-white font-bold"
            >
              {processingPayment ? "Procesando..." : "Confirmar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogTitle className="flex items-center gap-2">Escáner QR Avanzado</DialogTitle>
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
                  Funciona mejor en dispositivos móviles con cámara trasera
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                  <div className="text-center text-gray-500">
                    <Scan className="h-16 w-16 mx-auto mb-2" />
                    <p className="text-sm">Modo Manual</p>
                    <p className="text-xs mt-2">
                      Perfecto para escáneres físicos
                      <br />
                      También funciona con códigos QR
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
                      OK
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

      {/* Export Inventory Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-md border-rose-200">
          <DialogHeader>
            <DialogTitle className="text-xl bg-gradient-to-r from-rose-800 to-red-900 bg-clip-text text-transparent flex items-center gap-2">
              <Printer className="h-5 w-5 text-rose-800" />
              Exportar Inventario
            </DialogTitle>
            <DialogDescription>
              Selecciona las secciones que deseas incluir en el reporte de inventario.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Secciones</Label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllSections} className="text-xs bg-transparent">
                    Todas
                  </Button>
                  <Button variant="outline" size="sm" onClick={deselectAllSections} className="text-xs bg-transparent">
                    Ninguna
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-lg p-3 bg-gray-50">
                {getUniqueSections().map((section) => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={`section-${section}`}
                      checked={selectedSections.includes(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <label
                      htmlFor={`section-${section}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {section}
                    </label>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                {selectedSections.length} de {getUniqueSections().length} secciones seleccionadas
              </p>
            </div>

            <div className="space-y-3 border-t pt-3">
              <Label className="text-base font-semibold">Incluir secciones especiales</Label>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-stock-bajo"
                    checked={includeStockBajo}
                    onCheckedChange={(checked) => setIncludeStockBajo(checked as boolean)}
                  />
                  <label htmlFor="include-stock-bajo" className="text-sm cursor-pointer">
                    Stock Bajo
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-por-vencer"
                    checked={includePorVencer}
                    onCheckedChange={(checked) => setIncludePorVencer(checked as boolean)}
                  />
                  <label htmlFor="include-por-vencer" className="text-sm cursor-pointer">
                    Por Vencer
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-vencidos"
                    checked={includeVencidos}
                    onCheckedChange={(checked) => setIncludeVencidos(checked as boolean)}
                  />
                  <label htmlFor="include-vencidos" className="text-sm cursor-pointer">
                    Vencidos
                  </label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)} className="bg-transparent">
              Cancelar
            </Button>
            <Button
              onClick={generateStockReport}
              disabled={selectedSections.length === 0}
              className="bg-gradient-to-r from-rose-800 to-red-900 hover:from-rose-900 hover:to-red-950"
            >
              <Printer className="h-4 w-4 mr-2" />
              Imprimir Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
