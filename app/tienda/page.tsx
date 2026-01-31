"use client"

import { useState, useEffect, useMemo } from "react"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useSearchParams } from "next/navigation"
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Package,
  Clock,
  MapPin,
  Phone,
  Sparkles,
  X,
  CheckCircle2,
  Copy,
  Check,
  ArrowLeft,
  Pill,
  Filter,
  ChevronRight,
  Home,
} from "lucide-react"

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  stock_quantity: number
  barcode: string | null
  category: string | null
  section: string | null
  image_url: string | null
  created_at: string
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
}

interface Order {
  id: string
  order_number: string
  pickup_code: string
  total: number
  status: string
  customer_name: string
  customer_phone: string
}

const sectionIcons: Record<string, string> = {
  "Mostrador": "bg-blue-100 text-blue-600",
  "Estante A": "bg-emerald-100 text-emerald-600",
  "Estante B": "bg-amber-100 text-amber-600",
  "Estante C": "bg-rose-100 text-rose-600",
  "Refrigerador": "bg-cyan-100 text-cyan-600",
  "Vitrina": "bg-violet-100 text-violet-600",
}

const categoryIcons: Record<string, string> = {
  "Farmacia": "bg-blue-100 text-blue-600",
  "Nutrición": "bg-emerald-100 text-emerald-600",
  "Suplementos": "bg-amber-100 text-amber-600",
  "Otros": "bg-rose-100 text-rose-600",
}

const categories = ["Farmacia", "Nutrición", "Otros", "Suplementos"]; // Categories sorted alphabetically

export default function TiendaPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isOrderComplete, setIsOrderComplete] = useState(false)
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)
  const [customerName, setCustomerName] = useState("")
  const [customerPhone, setCustomerPhone] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    const sectionParam = searchParams.get("section")
    if (sectionParam) {
      setSelectedSection(sectionParam)
    }
    loadData()
  }, [searchParams])

  async function loadData() {
    setLoading(true)
    try {
      const { data: productsData } = await supabase
        .from("products")
        .select("*")
        .gt("stock_quantity", 0)
        .order("name")

      if (productsData) {
        setProducts(productsData)
      }

      const now = new Date().toISOString()
      const { data: promotionsData } = await supabase
        .from("promotions")
        .select("*")
        .eq("is_active", true)
        .lte("start_date", now)
        .gte("end_date", now)

      if (promotionsData) {
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
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  const sections = useMemo(() => {
    const sects = new Set(products.map((p) => p.section).filter(Boolean))
    return Array.from(sects).sort((a, b) => a.localeCompare(b, 'es')) as string[]
  }, [products])

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.includes(searchTerm)
      const matchesSection = !selectedSection || product.section === selectedSection
      return matchesSearch && matchesSection
    })
  }, [products, searchTerm, selectedSection])

  const productsBySection = useMemo(() => {
    const grouped: Record<string, Product[]> = {}
    for (const product of filteredProducts) {
      const sect = product.section || "Sin Seccion"
      if (!grouped[sect]) grouped[sect] = []
      grouped[sect].push(product)
    }
    return grouped
  }, [filteredProducts])

  const productsByCategory = useMemo(() => {
    const grouped: Record<string, Product[]> = {}
    for (const product of filteredProducts) {
      const cat = product.category || "Otros"
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(product)
    }
    return grouped
  }, [filteredProducts])

  const getProductDiscount = (productId: string) => {
    for (const promo of promotions) {
      if (promo.product_ids.includes(productId)) {
        return promo
      }
    }
    return null
  }

  const getDiscountedPrice = (product: Product) => {
    const promo = getProductDiscount(product.id)
    if (!promo) return product.price
    if (promo.discount_type === "percentage") {
      return product.price * (1 - promo.discount_value / 100)
    }
    return Math.max(0, product.price - promo.discount_value)
  }

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id)
      if (existing) {
        if (existing.quantity >= product.stock_quantity) return prev
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      return [...prev, { product, quantity: 1 }]
    })
  }

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId))
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item
          const newQuantity = item.quantity + delta
          if (newQuantity <= 0) return null
          if (newQuantity > item.product.stock_quantity) return item
          return { ...item, quantity: newQuantity }
        })
        .filter(Boolean) as CartItem[]
    )
  }

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const price = getDiscountedPrice(item.product)
      return sum + price * item.quantity
    }, 0)
  }, [cart, promotions])

  const cartItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }, [cart])

  const generatePickupCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let code = ""
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const handleCheckout = async () => {
    if (!customerName.trim() || !customerPhone.trim()) return
    setIsSubmitting(true)

    try {
      const pickupCode = generatePickupCode()
      const orderNumber = `ORD-${Date.now()}`

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber,
          pickup_code: pickupCode,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          subtotal: cartTotal,
          discount: 0,
          total: cartTotal,
          status: "pending",
          notes: null,
        })
        .select()
        .single()

      if (orderError) throw orderError

      const orderItems = cart.map((item) => ({
        order_id: orderData.id,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        discount: item.product.price - getDiscountedPrice(item.product),
        subtotal: getDiscountedPrice(item.product) * item.quantity,
      }))

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems)

      if (itemsError) throw itemsError

      for (const item of cart) {
        await supabase
          .from("products")
          .update({ stock_quantity: item.product.stock_quantity - item.quantity })
          .eq("id", item.product.id)
      }

      setCompletedOrder({
        id: orderData.id,
        order_number: orderNumber,
        pickup_code: pickupCode,
        total: cartTotal,
        status: "pending",
        customer_name: customerName,
        customer_phone: customerPhone,
      })
      setIsCheckoutOpen(false)
      setIsOrderComplete(true)
      setCart([])
      setCustomerName("")
      setCustomerPhone("")
    } catch (error) {
      console.error("Error creating order:", error)
      alert("Error al crear el pedido. Intente de nuevo.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const copyPickupCode = () => {
    if (completedOrder) {
      navigator.clipboard.writeText(completedOrder.pickup_code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const featuredProducts = useMemo(() => {
    return products.filter((p) => getProductDiscount(p.id)).slice(0, 8)
  }, [products, promotions])

  if (loading) {
    return <StoreLoadingSkeleton />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b">
        {/* Desktop Header */}
        <div className="hidden md:block">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-4 shrink-0">
                <Image
                  src="/images/logo.jpeg"
                  alt="Farmacia Bienestar"
                  width={56}
                  height={56}
                  className="rounded-xl shadow-sm"
                />
                <div>
                  <h1 className="font-bold text-xl leading-tight text-primary tracking-tight">Farmacia Bienestar</h1>
                  <p className="text-sm text-muted-foreground font-medium">Tienda en Linea</p>
                </div>
              </Link>

              <div className="flex-1 max-w-2xl">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar medicamentos, vitaminas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 bg-muted/50 border-0 focus-visible:ring-primary h-12 text-base rounded-xl"
                  />
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                      onClick={() => setSearchTerm("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="lg" className="relative bg-transparent gap-2 h-12 px-5 rounded-xl">
                    <ShoppingCart className="h-5 w-5" />
                    <span className="font-semibold">Carrito</span>
                    {cartItemsCount > 0 && (
                      <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
                        {cartItemsCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="flex flex-col w-full sm:max-w-md p-0">
                  {/* Cart Header */}
                  <div className="bg-primary text-primary-foreground p-6 pb-8">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-3 text-primary-foreground">
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                          <ShoppingCart className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-lg">Mi Carrito</span>
                          <p className="text-sm font-normal text-primary-foreground/80">
                            {cartItemsCount} {cartItemsCount === 1 ? "producto" : "productos"}
                          </p>
                        </div>
                      </SheetTitle>
                    </SheetHeader>
                  </div>

                  {cart.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 -mt-4">
                      <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mb-4">
                        <ShoppingCart className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">Tu carrito esta vacio</h3>
                      <p className="text-muted-foreground text-sm mb-6 max-w-[240px]">
                        Explora nuestra tienda y agrega productos para comenzar tu pedido
                      </p>
                      <Button onClick={() => setIsCartOpen(false)} className="rounded-full px-6">
                        Explorar productos
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Products List */}
                      <ScrollArea className="flex-1 -mt-4">
                        <div className="px-4 pb-4">
                          <div className="bg-background rounded-2xl shadow-sm border overflow-hidden">
                            {cart.map((item, index) => {
                              const discount = getProductDiscount(item.product.id)
                              const discountedPrice = getDiscountedPrice(item.product)
                              const itemTotal = discountedPrice * item.quantity
                              return (
                                <div
                                  key={item.product.id}
                                  className={`p-4 ${index !== cart.length - 1 ? "border-b" : ""}`}
                                >
                                  <div className="flex gap-4">
                                    {/* Product Image */}
                                    <div className="h-20 w-20 rounded-xl bg-muted overflow-hidden shrink-0 shadow-sm">
                                      {item.product.image_url ? (
                                        <Image
                                          src={item.product.image_url || "/placeholder.svg"}
                                          alt={item.product.name}
                                          width={80}
                                          height={80}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="h-full w-full flex items-center justify-center">
                                          <Package className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Product Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-medium text-sm line-clamp-2 leading-tight">{item.product.name}</h4>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 -mt-1 -mr-2 text-muted-foreground hover:text-destructive"
                                          onClick={() => removeFromCart(item.product.id)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      
                                      {/* Price */}
                                      <div className="flex items-center gap-2 mt-1">
                                        {discount ? (
                                          <>
                                            <span className="text-sm font-semibold text-primary">
                                              ${discountedPrice.toFixed(2)}
                                            </span>
                                            <span className="text-xs text-muted-foreground line-through">
                                              ${item.product.price.toFixed(2)}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary">
                                              {discount.discount_type === "percentage"
                                                ? `-${discount.discount_value}%`
                                                : `-$${discount.discount_value}`}
                                            </Badge>
                                          </>
                                        ) : (
                                          <span className="text-sm font-semibold text-foreground">
                                            ${item.product.price.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Quantity Controls & Subtotal */}
                                      <div className="flex items-center justify-between mt-3">
                                        <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-full hover:bg-background"
                                            onClick={() => updateQuantity(item.product.id, -1)}
                                          >
                                            <Minus className="h-3 w-3" />
                                          </Button>
                                          <span className="text-sm font-semibold w-8 text-center">
                                            {item.quantity}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-full hover:bg-background"
                                            onClick={() => updateQuantity(item.product.id, 1)}
                                            disabled={item.quantity >= item.product.stock_quantity}
                                          >
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        <span className="text-sm font-bold">${itemTotal.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </ScrollArea>

                      {/* Cart Summary Footer */}
                      <div className="border-t bg-muted/30 p-4 space-y-4">
                        <div className="bg-background rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>${cartTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Pago en tienda</span>
                            <span className="text-emerald-600 font-medium">$0.00</span>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">Total a pagar</span>
                            <span className="text-xl font-bold text-primary">${cartTotal.toFixed(2)}</span>
                          </div>
                        </div>
                        
                        <Button
                          className="w-full h-12 rounded-xl text-base font-semibold shadow-lg"
                          size="lg"
                          onClick={() => {
                            setIsCartOpen(false)
                            setIsCheckoutOpen(true)
                          }}
                        >
                          Continuar con el pedido
                          <ChevronRight className="h-5 w-5 ml-2" />
                        </Button>
                        
                        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          Recoge y paga en nuestra sucursal
                        </p>
                      </div>
                    </>
                  )}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
        
        {/* Mobile Header */}
        <div className="md:hidden">
          <div className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <Link href="/" className="flex items-center gap-3 shrink-0">
                <Image
                  src="/images/logo.jpeg"
                  alt="Farmacia Bienestar"
                  width={44}
                  height={44}
                  className="rounded-xl shadow-sm"
                />
                <div>
                  <h1 className="font-bold text-base leading-tight text-primary">Farmacia Bienestar</h1>
                  <p className="text-xs text-muted-foreground">Tienda en Linea</p>
                </div>
              </Link>
              
              <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="relative bg-transparent h-10 w-10 rounded-xl shrink-0">
                    <ShoppingCart className="h-5 w-5" />
                    {cartItemsCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                        {cartItemsCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent className="flex flex-col w-full sm:max-w-md p-0">
                  {/* Cart Header */}
                  <div className="bg-primary text-primary-foreground p-6 pb-8">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-3 text-primary-foreground">
                        <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                          <ShoppingCart className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="text-lg">Mi Carrito</span>
                          <p className="text-sm font-normal text-primary-foreground/80">
                            {cartItemsCount} {cartItemsCount === 1 ? "producto" : "productos"}
                          </p>
                        </div>
                      </SheetTitle>
                    </SheetHeader>
                  </div>

                  {cart.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-6 -mt-4">
                      <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mb-4">
                        <ShoppingCart className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold text-lg mb-2">Tu carrito esta vacio</h3>
                      <p className="text-muted-foreground text-sm mb-6 max-w-[240px]">
                        Explora nuestra tienda y agrega productos para comenzar tu pedido
                      </p>
                      <Button onClick={() => setIsCartOpen(false)} className="rounded-full px-6">
                        Explorar productos
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Products List */}
                      <ScrollArea className="flex-1 -mt-4">
                        <div className="px-4 pb-4">
                          <div className="bg-background rounded-2xl shadow-sm border overflow-hidden">
                            {cart.map((item, index) => {
                              const discount = getProductDiscount(item.product.id)
                              const discountedPrice = getDiscountedPrice(item.product)
                              const itemTotal = discountedPrice * item.quantity
                              return (
                                <div
                                  key={item.product.id}
                                  className={`p-4 ${index !== cart.length - 1 ? "border-b" : ""}`}
                                >
                                  <div className="flex gap-4">
                                    {/* Product Image */}
                                    <div className="h-20 w-20 rounded-xl bg-muted overflow-hidden shrink-0 shadow-sm">
                                      {item.product.image_url ? (
                                        <Image
                                          src={item.product.image_url || "/placeholder.svg"}
                                          alt={item.product.name}
                                          width={80}
                                          height={80}
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="h-full w-full flex items-center justify-center">
                                          <Package className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Product Info */}
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-start justify-between gap-2">
                                        <h4 className="font-medium text-sm line-clamp-2 leading-tight">{item.product.name}</h4>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 -mt-1 -mr-2 text-muted-foreground hover:text-destructive"
                                          onClick={() => removeFromCart(item.product.id)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      
                                      {/* Price */}
                                      <div className="flex items-center gap-2 mt-1">
                                        {discount ? (
                                          <>
                                            <span className="text-sm font-semibold text-primary">
                                              ${discountedPrice.toFixed(2)}
                                            </span>
                                            <span className="text-xs text-muted-foreground line-through">
                                              ${item.product.price.toFixed(2)}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px] h-5 bg-primary/10 text-primary">
                                              {discount.discount_type === "percentage"
                                                ? `-${discount.discount_value}%`
                                                : `-$${discount.discount_value}`}
                                            </Badge>
                                          </>
                                        ) : (
                                          <span className="text-sm font-semibold text-foreground">
                                            ${item.product.price.toFixed(2)}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Quantity Controls & Subtotal */}
                                      <div className="flex items-center justify-between mt-3">
                                        <div className="flex items-center gap-1 bg-muted rounded-full p-1">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-full hover:bg-background"
                                            onClick={() => updateQuantity(item.product.id, -1)}
                                          >
                                            <Minus className="h-3 w-3" />
                                          </Button>
                                          <span className="text-sm font-semibold w-8 text-center">
                                            {item.quantity}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 rounded-full hover:bg-background"
                                            onClick={() => updateQuantity(item.product.id, 1)}
                                            disabled={item.quantity >= item.product.stock_quantity}
                                          >
                                            <Plus className="h-3 w-3" />
                                          </Button>
                                        </div>
                                        <span className="text-sm font-bold">${itemTotal.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </ScrollArea>

                      {/* Cart Summary Footer */}
                      <div className="border-t bg-muted/30 p-4 space-y-4">
                        <div className="bg-background rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>${cartTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Pago en tienda</span>
                            <span className="text-emerald-600 font-medium">$0.00</span>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">Total a pagar</span>
                            <span className="text-xl font-bold text-primary">${cartTotal.toFixed(2)}</span>
                          </div>
                        </div>
                        
                        <Button
                          className="w-full h-12 rounded-xl text-base font-semibold shadow-lg"
                          size="lg"
                          onClick={() => {
                            setIsCartOpen(false)
                            setIsCheckoutOpen(true)
                          }}
                        >
                          Continuar con el pedido
                          <ChevronRight className="h-5 w-5 ml-2" />
                        </Button>
                        
                        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          Recoge y paga en nuestra sucursal
                        </p>
                      </div>
                    </>
                  )}
                </SheetContent>
              </Sheet>
            </div>
            
            {/* Mobile Search */}
            <div className="mt-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar productos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-muted/50 border-0 focus-visible:ring-primary h-11 text-sm rounded-xl"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
                    onClick={() => setSearchTerm("")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>
      
      {/* Breadcrumb & Section Filter */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                <Home className="h-4 w-4" />
              </Link>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Tienda</span>
              {selectedSection && (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedSection}</span>
                </>
              )}
            </div>
            {selectedSection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedSection(null)}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Limpiar filtro
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Section Pills - Deslizable con touch/mouse */}
      {sections.length > 0 && !searchTerm && (
        <div className="border-b bg-background sticky top-[105px] md:top-[89px] z-40">
          <div className="py-3">
            <div 
              className="flex gap-2 overflow-x-auto scrollbar-hide px-4 scroll-smooth snap-x snap-mandatory touch-pan-x"
              style={{ 
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              <Button
                variant={selectedSection === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedSection(null)}
                className={`shrink-0 rounded-full snap-start ${selectedSection === null ? "" : "bg-transparent"}`}
              >
                Todas
              </Button>
              {sections.map((section) => (
                <Button
                  key={section}
                  variant={selectedSection === section ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedSection(section)}
                  className={`shrink-0 rounded-full snap-start ${selectedSection === section ? "" : "bg-transparent"}`}
                >
                  {section}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {searchTerm && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-1">
              Resultados para "{searchTerm}"
            </h2>
            <p className="text-sm text-muted-foreground">
              {filteredProducts.length} productos encontrados
            </p>
          </div>
        )}

        {filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Search className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-xl mb-2">No se encontraron productos</h3>
            <p className="text-muted-foreground mb-6">
              Intenta con otra busqueda o explora nuestras secciones
            </p>
            <Button variant="outline" className="bg-transparent" onClick={() => {
              setSearchTerm("")
              setSelectedSection(null)
            }}>
              Ver todos los productos
            </Button>
          </div>
        ) : selectedSection || searchTerm ? (
          // Grid view when filtering
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                discount={getProductDiscount(product.id)}
                discountedPrice={getDiscountedPrice(product)}
                inCart={cart.find((item) => item.product.id === product.id)}
                onAdd={() => addToCart(product)}
                onUpdateQuantity={(delta) => updateQuantity(product.id, delta)}
              />
            ))}
          </div>
        ) : (
          // Grouped by section view - Deslizable en movil
          <div className="space-y-8 md:space-y-12">
            {Object.entries(productsBySection).sort(([a], [b]) => a.localeCompare(b, 'es')).map(([section, sectionProducts]) => (
              <section key={section} className="-mx-4 md:mx-0">
                <div className="flex items-center justify-between mb-4 px-4 md:px-0">
                  <div className="flex items-center gap-3">
                    <div className={`h-9 w-9 md:h-10 md:w-10 rounded-xl flex items-center justify-center ${sectionIcons[section] || "bg-muted text-muted-foreground"}`}>
                      <Package className="h-4 w-4 md:h-5 md:w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg md:text-xl font-bold">{section}</h2>
                      <p className="text-xs md:text-sm text-muted-foreground">{sectionProducts.length} productos</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSection(section)}
                    className="text-primary text-sm"
                  >
                    Ver todos
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                {/* Carrusel deslizable en movil, grid en desktop */}
                <div 
                  className="flex gap-3 overflow-x-auto scrollbar-hide px-4 md:px-0 pb-2 snap-x snap-mandatory touch-pan-x md:grid md:grid-cols-4 lg:grid-cols-5 md:gap-4 md:overflow-visible"
                  style={{ 
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                  }}
                >
                  {sectionProducts.slice(0, 10).map((product) => (
                    <div key={product.id} className="w-[160px] shrink-0 snap-start md:w-auto">
                      <ProductCard
                        product={product}
                        discount={getProductDiscount(product.id)}
                        discountedPrice={getDiscountedPrice(product)}
                        inCart={cart.find((item) => item.product.id === product.id)}
                        onAdd={() => addToCart(product)}
                        onUpdateQuantity={(delta) => updateQuantity(product.id, delta)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-muted/50 border-t mt-12 py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                  <Pill className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">Farmacia Bienestar</h3>
                  <p className="text-xs text-muted-foreground">Tu salud, nuestra prioridad</p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Horario
              </h4>
              <p className="text-sm text-muted-foreground">Lunes - Sabado: 8:00 AM - 10:00 PM</p>
              <p className="text-sm text-muted-foreground">Domingo: 8:00 AM - 9:00 PM</p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Ubicacion
              </h4>
              <p className="text-sm text-muted-foreground">Blvd. Enrrique Carrola Antuna #1001, Victoria de Durango Centro</p>
              <div className="flex items-center gap-2 mt-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm">(618) 188-7244</span>
              </div>
            </div>
          </div>
          <Separator className="my-6" />
          <p className="text-center text-sm text-muted-foreground">
            2026 Farmacia Bienestar. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      {/* Floating Cart Button (Mobile) */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-4 left-4 right-4 md:hidden z-40">
          <Button
            className="w-full shadow-xl h-14"
            size="lg"
            onClick={() => setIsCartOpen(true)}
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            Ver Carrito ({cartItemsCount}) - ${cartTotal.toFixed(2)}
          </Button>
        </div>
      )}

      {/* Checkout Dialog */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Completar Pedido</DialogTitle>
            <DialogDescription>
              Ingresa tus datos para recoger tu pedido en tienda
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Nombre completo</label>
              <Input
                placeholder="Tu nombre"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-11"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Telefono</label>
              <Input
                placeholder="(123) 456-7890"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="h-11"
              />
            </div>
            <Separator />
            <div className="bg-muted/50 rounded-xl p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Productos ({cartItemsCount})</span>
                <span>${cartTotal.toFixed(2)}</span>
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between font-semibold text-lg">
                <span>Total a pagar</span>
                <span className="text-primary">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Recibiras un codigo para recoger tu pedido. El pago se realiza en tienda.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 bg-transparent h-11" onClick={() => setIsCheckoutOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1 h-11"
              onClick={handleCheckout}
              disabled={!customerName.trim() || !customerPhone.trim() || isSubmitting}
            >
              {isSubmitting ? "Procesando..." : "Confirmar Pedido"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Complete Dialog */}
      <Dialog open={isOrderComplete} onOpenChange={setIsOrderComplete}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-6">
            <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Pedido Confirmado</h2>
            <p className="text-muted-foreground mb-6">
              Presenta este codigo en caja para recoger tu pedido
            </p>

            {completedOrder && (
              <div className="space-y-4">
                <div className="bg-primary/10 rounded-2xl p-6">
                  <p className="text-sm text-muted-foreground mb-2">Codigo de Recogida</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-4xl font-mono font-bold tracking-widest text-primary">
                      {completedOrder.pickup_code}
                    </span>
                    <Button variant="ghost" size="icon" onClick={copyPickupCode}>
                      {copiedCode ? (
                        <Check className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Copy className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 text-left">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <span className="text-muted-foreground">Pedido:</span>
                    <span className="font-medium">{completedOrder.order_number}</span>
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-medium text-primary">${completedOrder.total.toFixed(2)}</span>
                    <span className="text-muted-foreground">Nombre:</span>
                    <span className="font-medium">{completedOrder.customer_name}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Tu pedido estara listo en 15-30 minutos</span>
                </div>
              </div>
            )}

            <Button className="w-full mt-6 h-11" onClick={() => setIsOrderComplete(false)}>
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Product Card Component
function ProductCard({
  product,
  discount,
  discountedPrice,
  inCart,
  onAdd,
  onUpdateQuantity,
}: {
  product: Product
  discount: Promotion | null
  discountedPrice: number
  inCart?: CartItem
  onAdd: () => void
  onUpdateQuantity: (delta: number) => void
}) {
  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300">
      <div className="aspect-square relative bg-muted overflow-hidden">
        {product.image_url ? (
          <Image
            src={product.image_url || "/placeholder.svg"}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Package className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
        {discount && (
          <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground">
            {discount.discount_type === "percentage"
              ? `-${discount.discount_value}%`
              : `-$${discount.discount_value}`}
          </Badge>
        )}
        {product.stock_quantity <= 5 && product.stock_quantity > 0 && (
          <Badge variant="secondary" className="absolute top-2 right-2 text-xs">
            Ultimos {product.stock_quantity}
          </Badge>
        )}
      </div>
      <CardContent className="p-4">
        <h3 className="font-medium text-sm line-clamp-2 min-h-[2.5rem] mb-1">
          {product.name}
        </h3>
        {product.section && (
          <p className="text-xs text-muted-foreground mb-3">{product.section}</p>
        )}
        <div className="flex items-end justify-between gap-2">
          <div>
            {discount ? (
              <div className="flex flex-col">
                <span className="font-bold text-lg text-primary">
                  ${discountedPrice.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground line-through">
                  ${product.price.toFixed(2)}
                </span>
              </div>
            ) : (
              <span className="font-bold text-lg">${product.price.toFixed(2)}</span>
            )}
          </div>
          {inCart ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 bg-transparent"
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdateQuantity(-1)
                }}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center text-sm font-medium">
                {inCart.quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 bg-transparent"
                onClick={(e) => {
                  e.stopPropagation()
                  onUpdateQuantity(1)
                }}
                disabled={inCart.quantity >= product.stock_quantity}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl"
              onClick={(e) => {
                e.stopPropagation()
                onAdd()
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StoreLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-11 flex-1 max-w-2xl rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-lg" />
          </div>
        </div>
      </header>
      <div className="container mx-auto px-4 py-8">
        <div className="flex gap-2 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square" />
              <CardContent className="p-4">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3 mb-3" />
                <div className="flex justify-between">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-9 w-9 rounded-xl" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
