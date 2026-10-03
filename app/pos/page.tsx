"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  Store,
  PackagePlus,
  CheckCircle2,
  ExternalLink,
  Search,
  Wallet,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useRouter } from "next/navigation"
import { InstallPrompt } from "@/components/install-prompt"

const PRODUCTS_PER_PAGE = 30

interface BranchInfo {
  id: string
  name: string
}

interface Product {
  id: string
  name: string
  price: number
  stock_quantity: number
  min_stock_level?: number
  barcode?: string
  image_url?: string
  is_active: boolean
  section?: string
  branch_id?: string
  branches?: BranchInfo | BranchInfo[] | null
}

interface Promotion {
  id: string
  name: string
  description: string | null
  discount_type: "percentage" | "fixed"
  discount_value: number
  start_date: string
  end_date: string
  is_active: boolean
  product_ids: string[]
}

interface CartItem {
  product: Product
  quantity: number
  subtotal: number
  originalPrice: number
  discountedPrice: number
  hasPromotion: boolean
  promotionName?: string
}

export default function POSPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
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
  const [activeBranch, setActiveBranch] = useState<BranchInfo | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [availableBranches, setAvailableBranches] = useState<BranchInfo[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  const [branchConfirmed, setBranchConfirmed] = useState(false)
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null)
  const [quickOrderingId, setQuickOrderingId] = useState<string | null>(null)
  const [quickOrderedIds, setQuickOrderedIds] = useState<Set<string>>(new Set())
  const [quickOrderNotice, setQuickOrderNotice] = useState<{
    productName: string
    requestNumber: string
    quantity: number
  } | null>(null)

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

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName !== "INPUT" && e.key.match(/[0-9a-zA-Z]/)) {
        barcodeInputRef.current?.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    if (!authReady) return

    if (isAdmin) {
      if (!branchConfirmed || !selectedBranchId) {
        setLoading(false)
        return
      }
    } else if (!activeBranch?.id) {
      setLoading(false)
      return
    }

    loadProducts()
  }, [authReady, selectedBranchId, activeBranch?.id, isAdmin, branchConfirmed])

  const confirmAdminBranch = () => {
    if (!pendingBranchId) return
    const branch = availableBranches.find((b) => b.id === pendingBranchId)
    if (!branch) return

    setSelectedBranchId(pendingBranchId)
    setActiveBranch(branch)
    setBranchConfirmed(true)
    sessionStorage.setItem("pos_admin_branch_id", pendingBranchId)
    localStorage.setItem("pos_admin_branch_id", pendingBranchId)
    setLoading(true)
  }

  const getBranchName = (product: Product) => {
    if (Array.isArray(product.branches)) return product.branches[0]?.name
    if (product.branches && "name" in product.branches) return product.branches.name
    return activeBranch?.name || "Sucursal"
  }

  const isLowStock = (product: Product) =>
    product.stock_quantity <= (product.min_stock_level ?? 5)

  const suggestedOrderQty = (product: Product) => {
    const min = product.min_stock_level ?? 5
    return Math.max(1, min - product.stock_quantity)
  }

  const quickOrderProduct = async (product: Product, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const branchId = isAdmin ? selectedBranchId : activeBranch?.id
    if (!branchId) {
      alert("Elige la sucursal primero")
      return
    }

    const qty = suggestedOrderQty(product)
    setQuickOrderingId(product.id)
    try {
      const res = await fetch("/api/supply-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          items: [
            {
              product_id: product.id,
              product_name: product.name,
              barcode: product.barcode || null,
              quantity: qty,
            },
          ],
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "No se pudo enviar el pedido")

      setQuickOrderedIds((prev) => new Set(prev).add(product.id))
      setQuickOrderNotice({
        productName: product.name,
        requestNumber: data.request?.request_number || "Pedido",
        quantity: qty,
      })
      window.setTimeout(() => setQuickOrderNotice(null), 4500)
    } catch (err) {
      alert(err instanceof Error ? err.message : "No se pudo enviar el pedido")
    } finally {
      setQuickOrderingId(null)
    }
  }

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

    const branchRes = await fetch("/api/branches")
    if (branchRes.ok) {
      const branchData = await branchRes.json()
      setIsAdmin(branchData.isAdmin)
      setAvailableBranches(branchData.branches || [])

      if (branchData.isAdmin) {
        const savedBranchId =
          localStorage.getItem("pos_admin_branch_id") || sessionStorage.getItem("pos_admin_branch_id")
        const validSaved = branchData.branches?.find((b: BranchInfo) => b.id === savedBranchId)
        const defaultBranch = validSaved || branchData.branches?.[0] || null

        if (defaultBranch) {
          setPendingBranchId(defaultBranch.id)
          setSelectedBranchId(defaultBranch.id)
          setActiveBranch(defaultBranch)
          // Si ya eligió sucursal antes, entra directo (útil para varias ventanas de venta)
          setBranchConfirmed(Boolean(validSaved))
          if (validSaved) {
            localStorage.setItem("pos_admin_branch_id", validSaved.id)
            sessionStorage.setItem("pos_admin_branch_id", validSaved.id)
          }
        }
      } else {
        setActiveBranch(branchData.activeBranch)
        setSelectedBranchId(branchData.activeBranchId)
        setBranchConfirmed(true)
      }
    }

    setAuthReady(true)
    if (!branchRes.ok) {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      setLoading(true)
      const branchId = isAdmin ? selectedBranchId : activeBranch?.id
      const branchQuery = branchId ? `?branch_id=${branchId}` : ""
      const response = await fetch(`/api/products${branchQuery}`)
      const { products: data } = await response.json()

      const activeProducts = (data || []).filter((p: Product) => p.is_active !== false)
      setProducts(activeProducts)
      setCurrentPage(1)

      await loadPromotions()
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadPromotions = async () => {
    try {
      const now = new Date().toISOString()
      
      // Get active promotions
      const { data: promotionsData } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true)
        .lte("start_date", now)
        .gte("end_date", now)

      if (promotionsData) {
        // Get product associations for each promotion
        const promotionsWithProducts = await Promise.all(
          promotionsData.map(async (promo) => {
            const { data: productPromos } = await supabase
              .from("product_promotions")
              .select("product_id")
              .eq("promotion_id", promo.id)
            return {
              ...promo,
              product_ids: productPromos?.map((pp) => pp.product_id) || [],
            }
          })
        )
        setPromotions(promotionsWithProducts)
      }
    } catch (error) {
      console.error("Error loading promotions:", error)
    }
  }

  // Get promotion for a specific product
  const getProductPromotion = (productId: string): Promotion | null => {
    for (const promo of promotions) {
      if (promo.product_ids.includes(productId)) {
        return promo
      }
    }
    return null
  }

  // Calculate discounted price for a product
  const getDiscountedPrice = (product: Product): number => {
    const promo = getProductPromotion(product.id)
    if (!promo) return product.price
    
    if (promo.discount_type === "percentage") {
      return product.price * (1 - promo.discount_value / 100)
    }
    return Math.max(0, product.price - promo.discount_value)
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
    if (product.stock_quantity < 1) {
      const qty = suggestedOrderQty(product)
      if (window.confirm(`"${product.name}" está agotado.\n\n¿Pedir ${qty} pieza${qty === 1 ? "" : "s"} ahora?`)) {
        void quickOrderProduct(product)
      }
      return
    }

    const existingItem = cart.find((item) => item.product.id === product.id)

    if (existingItem) {
      if (existingItem.quantity >= product.stock_quantity) {
        alert("No hay suficiente stock")
        return
      }
      updateQuantity(product.id, existingItem.quantity + 1)
    } else {
      const promo = getProductPromotion(product.id)
      const discountedPrice = getDiscountedPrice(product)
      
      const newItem: CartItem = {
        product,
        quantity: 1,
        subtotal: discountedPrice,
        originalPrice: product.price,
        discountedPrice: discountedPrice,
        hasPromotion: promo !== null,
        promotionName: promo?.name,
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
          ? { ...item, quantity: newQuantity, subtotal: item.discountedPrice * newQuantity }
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

    const branchIdForSale = isAdmin ? selectedBranchId : activeBranch?.id
    if (!branchIdForSale) {
      alert("No hay sucursal activa para procesar la venta")
      return
    }

    setProcessingPayment(true)

    try {
      const discountValueNum = Number.parseFloat(discountValue || "0")
      const hasDiscount = discountValueNum > 0

      const response = await fetch("/api/process-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
            unit_price: item.product.price,
            subtotal: item.subtotal,
          })),
          payment_method: paymentMethod,
          cash_received: paymentMethod === "efectivo" ? Number.parseFloat(cashReceived) : null,
          change_given: paymentMethod === "efectivo" ? change : null,
          subtotal_before_discount: subtotal,
          discount_type: hasDiscount ? discountType : "none",
          discount_value: hasDiscount ? discountValueNum : 0,
          discount_reason: hasDiscount
            ? `Descuento ${discountType === "percentage" ? `${discountValueNum}%` : `$${discountValueNum}`}`
            : null,
          total_amount: total,
          branch_id: branchIdForSale,
        }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || "Error al procesar la venta")
      }

      const sale = { id: result.sale_id, total_amount: total, payment_method: paymentMethod }
      const discountReasonText = hasDiscount
        ? `Descuento ${discountType === "percentage" ? `${discountValueNum}%` : `$${discountValueNum}`}`
        : ""

      generateReceipt(sale, cart, discountAmount, discountReasonText, subtotal, total, cashReceived, change)

      clearCart()
      setIsPaymentDialogOpen(false)
      setIsCartOpen(false)
      setCashReceived("")
      setPaymentMethod("efectivo")
      loadProducts()
    } catch (error) {
      console.error("Error processing payment:", error)
      alert(error instanceof Error ? error.message : "Error al procesar el pago")
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
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
        .content { width: 100%; max-width: 55mm; margin: 0; padding: 2mm; box-sizing: border-box; }
        .center { text-align: center; margin-bottom: 5px; width: 100%; }
        .title { font-size: 15px; font-weight: bold; margin-bottom: 5px; width: 100%; }
        .line { border-bottom: 1px solid #000; margin: 8px 0; width: 100%; }
        .dashed-line { border-bottom: 1px dashed #000; margin: 5px 0; width: 100%; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; width: 100%; }
        .item-row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 11px; width: 100%; }
        .right-align { text-align: right; }
        .bold { font-weight: bold; }
        .small { font-size: 10px; }
        .discount { color: #000; }
        @media print {
            * { margin: 0 !important; padding: 0 !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 55mm !important; max-width: 55mm !important; }
            .content { width: 55mm !important; max-width: 55mm !important; margin: 0 !important; padding: 2mm !important; box-sizing: border-box !important; }
            @page { size: 55mm auto; margin: 0 !important; }
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
        ${item.hasPromotion ? `<div class="item-row" style="color: green;"><span>  PROMO: ${item.promotionName || 'Descuento'}</span><span></span></div>` : ""}
        <div class="item-row">
            <span>  ${item.quantity} x $${item.hasPromotion ? item.discountedPrice.toFixed(2) : item.product.price.toFixed(2)}${item.hasPromotion ? ` (antes $${item.originalPrice.toFixed(2)})` : ''}</span>
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
        ${(() => {
          const promoSavings = items.reduce((sum, item) => {
            if (item.hasPromotion) {
              return sum + ((item.originalPrice - item.discountedPrice) * item.quantity)
            }
            return sum
          }, 0)
          return promoSavings > 0 ? `
        <div class="row" style="color: green;">
            <span>AHORRO PROMOCIONES:</span>
            <span class="right-align">-$${promoSavings.toFixed(2)}</span>
        </div>
          ` : ""
        })()}
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
        ${(() => {
          const promoSavings = items.reduce((sum, item) => {
            if (item.hasPromotion) {
              return sum + ((item.originalPrice - item.discountedPrice) * item.quantity)
            }
            return sum
          }, 0)
          const totalSavings = promoSavings + discount
          return totalSavings > 0 ? `
        <div class="center small" style="margin-top: 3px; color: green;">
            <strong>Ahorraste $${totalSavings.toFixed(2)}</strong>
        </div>
          ` : ""
        })()}
        
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

  // NUEVA FUNCIÓN: Corte de turno ciego (sin totales visibles)
  const handleCorteTurno = async () => {
    try {
      setProcessingPayment(true)
      const now = new Date()
      const startOfDay = new Date(now)
      startOfDay.setHours(0, 0, 0, 0)

      let startTime = startOfDay
      const lastCutStr = localStorage.getItem(`lastCutTime_${currentUser.id}`)

      if (lastCutStr) {
        const lastCutDate = new Date(lastCutStr)
        if (lastCutDate > startOfDay) {
          startTime = lastCutDate
        }
      }

      const formatTime = (date: Date) => {
        return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
      }

      // Ticket de Corte Ciego - Obliga al cajero a reportar sus propios totales contados
      const ticketContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Corte de Turno Ciego</title>
    <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; width: 55mm; margin: 0; padding: 2mm; }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .line { border-bottom: 1px dashed #000; margin: 5px 0; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .mt-10 { margin-top: 15px; }
        .mt-20 { margin-top: 35px; }
        .box { margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="center bold" style="font-size: 14px;">CORTE DE TURNO</div>
    <div class="center">Farmacia Bienestar</div>
    <div class="line"></div>
    <div class="row"><span>FECHA:</span><span>${now.toLocaleDateString("es-ES")}</span></div>
    <div class="row"><span>PERIODO:</span><span>${formatTime(startTime)} - ${formatTime(now)}</span></div>
    <div class="row"><span>CAJERO:</span><span>${currentUser?.full_name}</span></div>
    <div class="line"></div>

    <div class="center bold mt-10">DECLARACIÓN DE VALORES</div>
    <div class="center" style="font-size: 10px; margin-bottom: 15px;">(A llenar por el cajero)</div>

    <div class="box">
        <div>EFECTIVO CONTADO (Moneda y billete):</div>
        <div style="margin-top: 8px; font-size: 14px;">$________________________</div>
    </div>

    <div class="box">
        <div>VOUCHERS / TARJETA:</div>
        <div style="margin-top: 8px; font-size: 14px;">$________________________</div>
    </div>

    <div class="box">
        <div>VALES / OTROS:</div>
        <div style="margin-top: 8px; font-size: 14px;">$________________________</div>
    </div>
    
    <div class="box">
        <div>FONDO DE CAJA FIJO:</div>
        <div style="margin-top: 8px; font-size: 14px;">$__${boxBalance.toFixed(2)}_____________</div>
    </div>

    <div class="mt-20 center">
        ___________________________
    </div>
    <div class="center bold" style="margin-top: 5px;">
        NOMBRE Y FIRMA
    </div>
    
    <div class="line mt-10"></div>
    <div class="center" style="font-size: 9px;">
        Documento de control interno.<br>
        Las diferencias seran reportadas por el administrador.
    </div>
</body>
</html>`

      const printWindow = window.open("", "_blank", "width=400,height=600")
      if (printWindow) {
        printWindow.document.write(ticketContent)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
          printWindow.print()
          printWindow.close()
          
          // Guardamos la hora actual como el último corte
          localStorage.setItem(`lastCutTime_${currentUser.id}`, now.toISOString())
          
          alert("✅ Formato de corte ciego impreso correctamente. Llena los datos y entrega en administración.")
        }, 250)
      }
    } catch (error) {
      console.error("Error al generar corte:", error)
      alert("Hubo un error al imprimir el formato de corte.")
    } finally {
      setProcessingPayment(false)
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
        const minStock = product.min_stock_level || 5
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
      const lowStockProducts = filteredBySection.filter((p: any) => p.stock_quantity <= (p.min_stock_level || 5))
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
    receipt += `Stock bajo: ${pad(filteredBySection.filter((p: any) => p.stock_quantity <= (p.min_stock_level || 5)).length.toString(), 23, "right")}\n`
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
      <div className="app-canvas flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Cargando punto de venta...</p>
        </div>
      </div>
    )
  }

  if (authReady && isAdmin && !branchConfirmed) {
    return (
      <div className="app-canvas min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md rounded-3xl border-0 shadow-xl shadow-black/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-fit rounded-2xl bg-primary p-3">
              <Store className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl">Selecciona la sucursal</CardTitle>
            <CardDescription>
              Como administrador, elige en qué farmacia vas a operar el punto de venta.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {availableBranches.length === 0 ? (
              <div className="text-center space-y-3">
                <p className="text-muted-foreground">No hay sucursales activas.</p>
                <Button onClick={() => router.push("/admin/branches")}>Crear sucursales</Button>
              </div>
            ) : (
              <>
                <Select value={pendingBranchId || undefined} onValueChange={setPendingBranchId}>
                  <SelectTrigger className="h-12 rounded-2xl border-0 bg-muted text-base">
                    <SelectValue placeholder="Elegir sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBranches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={confirmAdminBranch}
                  disabled={!pendingBranchId}
                  className="h-12 w-full rounded-2xl text-base"
                >
                  Entrar al POS
                </Button>
                <Button variant="ghost" className="w-full rounded-2xl" onClick={() => router.push("/admin/dashboard")}>
                  Volver al dashboard
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (authReady && !isAdmin && !activeBranch) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sin sucursal asignada</CardTitle>
            <CardDescription>
              Tu usuario no tiene una sucursal asignada. Contacta al administrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleLogout} variant="outline" className="w-full">
              Cerrar sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="app-canvas min-h-screen overflow-x-hidden">
      <header className="z-30 px-3 pt-3 sm:px-4 lg:sticky lg:top-0 lg:px-6">
        <div className="bento flex flex-col gap-3 px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.jpeg"
              alt="Farmacia Bienestar"
              className="h-11 w-11 shrink-0 rounded-2xl object-cover ring-1 ring-black/5"
            />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-primary lg:text-xl">
                Farmacia Bienestar
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {currentUser?.full_name}
                {activeBranch ? ` · ${activeBranch.name}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && availableBranches.length > 0 && (
              <Select
                value={selectedBranchId || undefined}
                onValueChange={(value) => {
                  setPendingBranchId(value)
                  setSelectedBranchId(value)
                  const branch = availableBranches.find((b) => b.id === value)
                  if (branch) setActiveBranch(branch)
                  sessionStorage.setItem("pos_admin_branch_id", value)
                  localStorage.setItem("pos_admin_branch_id", value)
                  setLoading(true)
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-full border-0 bg-muted px-4 sm:w-52">
                  <Store className="h-4 w-4 mr-2 shrink-0 text-primary" />
                  <SelectValue placeholder="Sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!isAdmin && activeBranch && (
              <Badge variant="outline" className="h-10 rounded-full border-0 bg-primary/10 px-4 text-sm text-primary">
                <Store className="h-4 w-4 mr-1" />
                {activeBranch.name}
              </Badge>
            )}
            {promotions.length > 0 && (
              <div className="hidden h-10 items-center gap-2 rounded-full bg-emerald-100 px-4 sm:flex">
                <Tag className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">
                  {promotions.length} Promo{promotions.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <Button
              onClick={() => {
                window.open(`/pos?venta=${Date.now()}`, `pos-venta-${Date.now()}`, "noopener,noreferrer")
              }}
              variant="ghost"
              className="h-10 rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15 hover:text-primary"
              title="Abre otra caja en una ventana aparte"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Otra venta</span>
            </Button>
            <Button
              onClick={() => router.push("/pos/pedido")}
              className="h-10 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
            >
              <PackagePlus className="h-4 w-4 mr-1" />
              Pedir
            </Button>
            <Button onClick={openExportDialog} variant="ghost" className="h-10 rounded-full bg-muted px-4 text-sm hover:bg-muted/70">
              <Printer className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Exportar</span>
            </Button>
            <Button onClick={handleCorteTurno} variant="ghost" className="hidden h-10 rounded-full bg-muted px-4 text-sm hover:bg-muted/70 md:inline-flex">
              <Banknote className="h-4 w-4 mr-1" />
              Corte
            </Button>
            <Button onClick={handleLogout} variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-muted hover:bg-muted/70" title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {quickOrderNotice && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-5 py-4 shadow-xl">
            <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-600" />
            <div>
              <p className="font-black text-emerald-900">¡Pedido confirmado!</p>
              <p className="text-sm text-emerald-800">
                {quickOrderNotice.quantity} pza de <strong>{quickOrderNotice.productName}</strong> ·{" "}
                {quickOrderNotice.requestNumber}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-5rem)] pb-28 lg:pb-0">
        <div className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 space-y-4 lg:space-y-5 overflow-auto">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="bento-accent flex flex-col justify-between gap-5 p-5 sm:p-6 xl:col-span-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-white/70">Tu salud es nuestro compromiso</p>
                  <h2 className="mt-0.5 truncate text-xl font-bold sm:text-2xl">¡Hola {currentUser?.full_name}!</h2>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  <Wallet className="h-5 w-5" />
                </span>
              </div>
              <div className="flex items-end justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3">
                <div>
                  <p className="text-xs text-white/70">Efectivo en caja</p>
                  <p className="text-3xl font-bold tracking-tight sm:text-4xl">${boxBalance.toFixed(2)}</p>
                </div>
                <Banknote className="mb-1 h-7 w-7 text-white/60" />
              </div>
            </div>

            <div className="bento space-y-3 p-4 sm:p-5 xl:col-span-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Scan className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
                  <Input
                    ref={barcodeInputRef}
                    placeholder="Escanea o escribe el código de barras..."
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleBarcodeSearch()}
                    className="h-14 rounded-2xl border-2 border-primary/20 bg-white pl-12 text-base focus-visible:border-primary focus-visible:ring-primary/20"
                    autoFocus
                  />
                </div>
                <Button onClick={handleBarcodeSearch} className="h-14 rounded-2xl px-5 text-base font-semibold shadow-sm">
                  <Plus className="h-5 w-5 sm:mr-1" />
                  <span className="hidden sm:inline">Agregar</span>
                </Button>
                <Button
                  onClick={() => setIsQRScannerOpen(true)}
                  variant="ghost"
                  className="h-14 w-14 shrink-0 rounded-2xl bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  title="Abrir escáner QR avanzado"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar medicamento por nombre o código..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="h-12 rounded-2xl border-0 bg-muted pl-11 text-base"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tip: Si el producto no existe en activos, te mostrará si está en eliminados
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h3 className="text-lg font-semibold tracking-tight">Productos</h3>
            <p className="text-xs text-muted-foreground">
              Mostrando {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} de {filteredProducts.length}{" "}
              productos
              {searchTerm && ` (filtrados de ${products.length} totales)`}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-3 lg:gap-4">
            {paginatedProducts.map((product) => {
              const promo = getProductPromotion(product.id)
              const discountedPrice = getDiscountedPrice(product)
              const hasDiscount = promo !== null
              const outOfStock = product.stock_quantity === 0
              
              return (
                <div
                  key={product.id}
                  className={`bento bento-hover flex flex-col overflow-hidden p-2.5 sm:p-3 ${hasDiscount ? "ring-2 ring-emerald-400" : ""}`}
                >
                  <div className="flex flex-1 flex-col">
                    <div className="flex flex-1 flex-col gap-2.5">
                      <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-2xl bg-primary/5 sm:h-28">
                        {hasDiscount && (
                          <div className="absolute left-2 top-2 z-10">
                            <Badge className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-white">
                              <Percent className="h-3 w-3 mr-1" />
                              {promo.discount_type === "percentage" 
                                ? `${promo.discount_value}% OFF` 
                                : `$${promo.discount_value} OFF`}
                            </Badge>
                          </div>
                        )}
                        {product.image_url ? (
                          <img
                            src={product.image_url || "/placeholder.svg"}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 sm:h-14 sm:w-14">
                            <span className="text-2xl">{'💊'}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col gap-1.5 px-0.5">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base">
                          {product.name}
                        </h3>
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Store className="h-3 w-3 shrink-0" />
                          <span className="truncate">Disponible en: {getBranchName(product)}</span>
                        </p>
                        {hasDiscount && (
                          <Badge variant="secondary" className="w-fit max-w-full rounded-full border-0 bg-emerald-100 text-[11px] text-emerald-700">
                            <Tag className="h-3 w-3 mr-1 shrink-0" />
                            <span className="truncate">{promo.name}</span>
                          </Badge>
                        )}
                        <div className="flex flex-wrap items-center gap-1">
                          {product.section && (
                            <Badge variant="outline" className="rounded-full border-0 bg-primary/10 text-[11px] text-primary">
                              {product.section}
                            </Badge>
                          )}
                          {isLowStock(product) && !outOfStock && (
                            <Badge variant="destructive" className="rounded-full text-[11px] font-semibold">
                              Stock bajo
                            </Badge>
                          )}
                          <Badge
                            variant={
                              product.stock_quantity > (product.min_stock_level ?? 5)
                                ? "default"
                                : product.stock_quantity > 0
                                  ? "secondary"
                                  : "destructive"
                            }
                            className="rounded-full text-[11px] font-semibold"
                          >
                            Stock: {product.stock_quantity}
                          </Badge>
                        </div>
                        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
                          {hasDiscount ? (
                            <>
                              <span className="text-xl font-bold tracking-tight text-emerald-600 sm:text-2xl">
                                ${discountedPrice.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground line-through">
                                ${product.price.toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <span className="text-xl font-bold tracking-tight text-primary sm:text-2xl">
                              ${product.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      {outOfStock ? (
                        <Button
                          onClick={(e) => quickOrderProduct(product, e)}
                          disabled={quickOrderingId === product.id || quickOrderedIds.has(product.id)}
                          className="h-11 w-full rounded-2xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
                        >
                          <PackagePlus className="h-4 w-4 mr-1.5" />
                          {quickOrderingId === product.id
                            ? "Enviando pedido..."
                            : quickOrderedIds.has(product.id)
                              ? "Pedido enviado"
                              : `Pedir ${suggestedOrderQty(product)} pza`}
                        </Button>
                      ) : (
                        <div className="space-y-1.5">
                          <Button
                            onClick={() => addToCart(product)}
                            className={`h-11 w-full rounded-2xl text-sm font-semibold text-white shadow-sm ${hasDiscount ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary hover:bg-primary/90"}`}
                          >
                            <Plus className="h-4 w-4 mr-1.5" />
                            <span className="sm:hidden">Agregar</span>
                            <span className="hidden sm:inline">
                              {hasDiscount ? "Agregar con Descuento" : "Agregar al Carrito"}
                            </span>
                          </Button>
                          {isLowStock(product) && (
                            <Button
                              variant="ghost"
                              onClick={(e) => quickOrderProduct(product, e)}
                              disabled={quickOrderingId === product.id || quickOrderedIds.has(product.id)}
                              className="h-9 w-full rounded-2xl bg-emerald-50 text-xs font-bold text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                            >
                              <PackagePlus className="h-4 w-4 mr-1" />
                              {quickOrderingId === product.id
                                ? "Enviando..."
                                : quickOrderedIds.has(product.id)
                                  ? "Pedido enviado"
                                  : `Pedir ${suggestedOrderQty(product)} más`}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filteredProducts.length > PRODUCTS_PER_PAGE && (
            <div className="flex flex-col items-center gap-3 mt-6 mb-6">
              <div className="bento flex flex-wrap justify-center items-center gap-1.5 p-1.5 rounded-full">
                <Button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  variant="ghost"
                  className="rounded-full"
                >
                  Anterior
                </Button>

                <div className="flex gap-1.5">
                  <Button
                    onClick={() => setCurrentPage(1)}
                    variant={currentPage === 1 ? "default" : "ghost"}
                    className="h-9 w-9 rounded-full p-0"
                  >
                    1
                  </Button>

                  {currentPage > 3 && <span className="flex items-center px-2">...</span>}

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => page > 1 && page < totalPages && Math.abs(page - currentPage) <= 1)
                    .map((page) => (
                      <Button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        variant={currentPage === page ? "default" : "ghost"}
                        className="h-9 w-9 rounded-full p-0"
                      >
                        {page}
                      </Button>
                    ))}

                  {currentPage < totalPages - 2 && <span className="flex items-center px-2">...</span>}

                  {totalPages > 1 && (
                    <Button
                      onClick={() => setCurrentPage(totalPages)}
                      variant={currentPage === totalPages ? "default" : "ghost"}
                      className="h-9 w-9 rounded-full p-0"
                    >
                      {totalPages}
                    </Button>
                  )}
                </div>

                <Button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  variant="ghost"
                  className="rounded-full"
                >
                  Siguiente
                </Button>
              </div>

              <div className="text-center text-xs text-muted-foreground">
                Página {currentPage} de {totalPages}
              </div>
            </div>
          )}
        </div>

        <aside className="hidden lg:block lg:w-[380px] xl:w-[420px] shrink-0 py-6 pr-6">
          <div className="bento sticky top-28 flex h-[calc(100vh-8.5rem)] flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ShoppingCart className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold leading-tight">Carrito</h2>
                <p className="text-xs text-muted-foreground">
                  {cart.length} producto{cart.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCart}
                className="h-9 rounded-full bg-red-50 px-3 text-red-600 hover:bg-red-100 hover:text-red-700"
                title="Vaciar carrito"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Vaciar
              </Button>
            )}
          </div>

          <div className="scrollbar-thin -mx-1 flex-1 space-y-2 overflow-auto px-1">
            {cart.map((item) => (
              <div
                key={item.product.id}
                className={`rounded-2xl p-3 ${item.hasPromotion ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-muted/50"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="line-clamp-2 text-sm font-semibold leading-tight">{item.product.name}</h4>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      {item.hasPromotion ? (
                        <>
                          <span className="font-semibold text-emerald-600">${item.discountedPrice.toFixed(2)}</span>
                          <span className="text-muted-foreground line-through">${item.originalPrice.toFixed(2)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">${item.product.price.toFixed(2)} c/u</span>
                      )}
                      {item.product.section && (
                        <Badge variant="outline" className="rounded-full border-0 bg-primary/10 px-2 py-0 text-[10px] text-primary">
                          {item.product.section}
                        </Badge>
                      )}
                      {item.hasPromotion && (
                        <Badge className="rounded-full bg-emerald-500 px-2 py-0 text-[10px] text-white">
                          <Percent className="h-2.5 w-2.5 mr-0.5" />
                          {item.promotionName || "Promo"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.product.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-600"
                    title="Quitar"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="h-8 w-8 rounded-full p-0"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-base font-bold">{item.quantity}</span>
                    <Button
                      size="sm"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="h-8 w-8 rounded-full p-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-right">
                    <span className={`block text-base font-bold ${item.hasPromotion ? "text-emerald-600" : "text-foreground"}`}>
                      ${item.subtotal.toFixed(2)}
                    </span>
                    {item.hasPromotion && (
                      <span className="text-[11px] text-emerald-600">
                        Ahorras ${((item.originalPrice - item.discountedPrice) * item.quantity).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {cart.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <span className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                  <ShoppingCart className="h-9 w-9 text-muted-foreground/50" />
                </span>
                <p className="font-semibold text-foreground">El carrito está vacío</p>
                <p className="text-sm">Escanea o agrega productos para comenzar</p>
              </div>
            )}
          </div>

          {cart.length > 0 && (() => {
            const promoSavings = cart.reduce((sum, item) => {
              if (item.hasPromotion) {
                return sum + ((item.originalPrice - item.discountedPrice) * item.quantity)
              }
              return sum
            }, 0)
            const hasPromotions = promoSavings > 0
            
            return (
              <div className="mt-4 space-y-3">
                {hasPromotions && (
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-2.5 text-emerald-700">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <Tag className="h-4 w-4" />
                      Ahorro por promociones
                    </span>
                    <span className="font-bold">-${promoSavings.toFixed(2)}</span>
                  </div>
                )}
                <div className="bento-accent p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-white/70">Total a pagar</p>
                      <p className="text-4xl font-bold tracking-tight">${total.toFixed(2)}</p>
                    </div>
                    <Receipt className="mb-1 h-7 w-7 text-white/50" />
                  </div>
                  <Button
                    onClick={() => setIsPaymentDialogOpen(true)}
                    className="mt-4 h-14 w-full rounded-2xl bg-white text-lg font-bold text-primary shadow-sm hover:bg-white/90"
                    size="lg"
                  >
                    <Banknote className="h-5 w-5 mr-2" />
                    Cobrar
                  </Button>
                </div>
              </div>
            )
          })()}
          </div>
        </aside>

        {/* Mobile sticky cart bar */}
        <div className="lg:hidden fixed inset-x-3 bottom-3 z-40">
          <div className="bento-accent mx-auto flex max-w-screen-sm items-center gap-2 p-2">
            <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-14 flex-1 justify-start gap-3 rounded-2xl bg-white/10 px-3 text-white hover:bg-white/15 hover:text-white"
                >
                  <span className="relative">
                    <ShoppingCart className="h-6 w-6" />
                    {cart.length > 0 && (
                      <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-primary">
                        {cart.length}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-[11px] font-normal text-white/70">Ver carrito</span>
                    <span className="text-lg font-bold">${total.toFixed(2)}</span>
                  </span>
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[88vh] gap-0 rounded-t-[28px] border-0 p-0">
                <SheetHeader className="px-5 pb-3 pt-5">
                  <SheetTitle className="flex items-center gap-2 text-lg">
                    <ShoppingCart className="h-5 w-5 text-primary" />
                    Carrito ({cart.length})
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 space-y-2 overflow-y-auto px-4 pb-4">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className={`rounded-2xl p-3 ${item.hasPromotion ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-muted/60"}`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <h4 className="line-clamp-2 text-sm font-semibold leading-tight">{item.product.name}</h4>
                          <p className="mt-0.5 text-xs text-muted-foreground">${item.discountedPrice.toFixed(2)} c/u</p>
                        </div>
                        <span className="shrink-0 font-bold">${item.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-sm">
                          <Button variant="ghost" size="sm" className="h-10 w-10 rounded-full p-0" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-bold text-lg">{item.quantity}</span>
                          <Button size="sm" className="h-10 w-10 rounded-full p-0" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 rounded-full p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
                      <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                        <ShoppingCart className="h-7 w-7 text-muted-foreground/50" />
                      </span>
                      <p>El carrito está vacío</p>
                    </div>
                  )}
                </div>
                {cart.length > 0 && (
                  <div className="border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <div className="mb-3 flex items-baseline justify-between">
                      <span className="text-sm text-muted-foreground">Total a pagar</span>
                      <span className="text-3xl font-bold tracking-tight text-primary">${total.toFixed(2)}</span>
                    </div>
                    <Button
                      onClick={() => {
                        setIsCartOpen(false)
                        setIsPaymentDialogOpen(true)
                      }}
                      className="h-14 w-full rounded-2xl text-lg font-bold shadow-sm"
                    >
                      <Banknote className="h-5 w-5 mr-2" />
                      Cobrar
                    </Button>
                  </div>
                )}
              </SheetContent>
            </Sheet>
            <Button
              onClick={() => (cart.length > 0 ? setIsPaymentDialogOpen(true) : setIsCartOpen(true))}
              disabled={cart.length === 0}
              className="h-14 shrink-0 rounded-2xl bg-white px-6 text-base font-bold text-primary shadow-sm hover:bg-white/90 disabled:opacity-60"
            >
              <Banknote className="h-5 w-5 mr-1.5" />
              Cobrar
            </Button>
          </div>
        </div>
      </div>

      <InstallPrompt />

      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-[28px] border-0 p-0 [&>button]:text-white! [&>button]:opacity-80">
          <div className="bento-accent rounded-none px-6 pb-6 pt-6">
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-sm font-medium text-white/75">Cobrar</DialogTitle>
              <DialogDescription className="sr-only">Subtotal: ${subtotal.toFixed(2)}</DialogDescription>
            </DialogHeader>
            <p className="mt-1 text-5xl font-bold tracking-tight">${total.toFixed(2)}</p>
            <p className="mt-1 text-sm text-white/70">
              Subtotal ${subtotal.toFixed(2)}
              {discountAmount > 0 && ` · Descuento -$${discountAmount.toFixed(2)}`}
            </p>
          </div>

          <div className="space-y-5 max-h-[60vh] overflow-y-auto p-5 sm:p-6">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod("efectivo")}
                className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                  paymentMethod === "efectivo"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-transparent bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                <Banknote className="h-6 w-6" />
                Efectivo
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("tarjeta")}
                className={`flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border-2 text-sm font-semibold transition-colors ${
                  paymentMethod === "tarjeta"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-transparent bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                <CreditCard className="h-6 w-6" />
                Tarjeta
              </button>
            </div>

            {paymentMethod === "efectivo" && (
              <div className="space-y-3">
                <Label htmlFor="cashReceived" className="text-sm font-semibold">
                  ¿Con cuánto paga?
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="cashReceived"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !processingPayment &&
                        cashReceived &&
                        Number.parseFloat(cashReceived) >= total
                      ) {
                        handlePayment()
                      }
                    }}
                    placeholder="0.00"
                    autoFocus
                    className="h-16 rounded-2xl border-2 border-primary/20 pl-10 text-center text-3xl font-bold focus-visible:border-primary focus-visible:ring-primary/20"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashReceived(total.toFixed(2))}
                    className="h-10 rounded-full bg-primary/10 px-4 text-sm font-semibold text-primary hover:bg-primary/15"
                  >
                    Exacto
                  </button>
                  {[20, 50, 100, 200, 500, 1000]
                    .filter((bill) => bill > total)
                    .slice(0, 4)
                    .map((bill) => (
                      <button
                        key={bill}
                        type="button"
                        onClick={() => setCashReceived(String(bill))}
                        className="h-10 rounded-full bg-muted px-4 text-sm font-semibold hover:bg-muted/70"
                      >
                        ${bill}
                      </button>
                    ))}
                </div>
                {cashReceived && Number.parseFloat(cashReceived) >= total && (
                  <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-5 py-4 ring-1 ring-emerald-200">
                    <span className="text-sm font-semibold text-emerald-700">Cambio</span>
                    <span className="text-3xl font-bold text-emerald-600">${change.toFixed(2)}</span>
                  </div>
                )}
                {cashReceived && Number.parseFloat(cashReceived) < total && (
                  <div className="flex items-center justify-between rounded-2xl bg-red-50 px-5 py-3 text-red-600">
                    <span className="text-sm font-semibold">Faltan</span>
                    <span className="text-xl font-bold">
                      ${(total - (Number.parseFloat(cashReceived) || 0)).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <details className="group rounded-2xl bg-muted/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-primary" />
                  Aplicar descuento
                </span>
                <span className="flex items-center gap-2">
                  {discountAmount > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700">
                      -${discountAmount.toFixed(2)}
                    </span>
                  )}
                  <Plus className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-45" />
                </span>
              </summary>
              <div className="space-y-3 px-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">Tipo</Label>
                    <Select
                      value={discountType}
                      onValueChange={(value: "percentage" | "fixed") => setDiscountType(value)}
                    >
                      <SelectTrigger className="h-11 rounded-xl border-0 bg-white">
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
                    <Label className="text-xs font-semibold text-muted-foreground">Valor</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === "percentage" ? "10" : "50.00"}
                      className="h-11 rounded-xl border-0 bg-white"
                    />
                  </div>
                </div>

                {discountAmount > 0 && (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                    <span>
                      {discountType === "percentage"
                        ? `${discountValue}% de descuento`
                        : `$${discountValue} de descuento`}
                    </span>
                    <span>-${discountAmount.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </details>
          </div>

          <DialogFooter className="gap-2 border-t bg-muted/30 p-4 sm:p-5">
            <Button
              variant="ghost"
              onClick={() => setIsPaymentDialogOpen(false)}
              className="h-12 rounded-2xl px-5"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePayment}
              disabled={
                processingPayment ||
                (paymentMethod === "efectivo" && (!cashReceived || Number.parseFloat(cashReceived) < total))
              }
              className="h-12 rounded-2xl px-6 text-base font-bold shadow-sm sm:min-w-[200px]"
            >
              <CheckCircle2 className="h-5 w-5 mr-2" />
              {processingPayment ? "Procesando..." : `Cobrar $${total.toFixed(2)}`}
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
        <DialogContent className="max-w-md rounded-[28px] border-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">Escáner QR Avanzado</DialogTitle>
            <DialogDescription>
              {scannerMode === "camera"
                ? "Apunta la cámara hacia el código QR"
                : "Ingresa el código manually o usa la cámara"}
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

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-w-md rounded-[28px] border-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-xl text-primary">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Printer className="h-5 w-5" />
              </span>
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

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto rounded-2xl p-3 bg-muted/60">
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
            <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)} className="rounded-2xl">
              Cancelar
            </Button>
            <Button
              onClick={generateStockReport}
              disabled={selectedSections.length === 0}
              className="rounded-2xl"
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
