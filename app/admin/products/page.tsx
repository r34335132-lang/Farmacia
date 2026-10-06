"use client"

import type React from "react"

import { useEffect, useState, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertTriangle,
  Archive,
  Boxes,
  CalendarClock,
  CalendarX,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  DollarSign,
  Edit,
  Keyboard,
  Layers,
  LayoutGrid,
  List,
  Package,
  PackagePlus,
  PackageX,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  ScanBarcode,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Truck,
  Wand2,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { AdminPageHeader } from "@/components/admin-page-header"
import { ImageUpload } from "@/components/image-upload"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CountUp, Magnetic, stagger } from "@/components/motion"
import { formatMoney, markupPercent } from "@/lib/money"
import { cn } from "@/lib/utils"

const PRODUCTS_PER_PAGE = 50

interface BranchInfo {
  id: string
  name: string
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
  branch_id?: string
  branches?: BranchInfo | BranchInfo[] | null
  sku_group_id?: string
  promotion_price?: number | null
  cost_price?: number
  markup_percent?: number | null
}

interface BranchPricingRow {
  branch_id: string
  branch_name: string
  enabled: boolean
  product_id?: string
  price: string
  cost_price: string
  stock_quantity: string
  min_stock_level: string
  promotion_price: string
  expiration_date: string
  markup_percent: string
}

interface Supplier {
  id: string
  name: string
  phone?: string | null
}

interface OrderDraftItem {
  key: string
  product_id: string
  product_name: string
  barcode?: string | null
  branch_id: string
  branch_name: string
  quantity: number
  image_url?: string | null
  stock_quantity: number
}

type QuickFilter = "all" | "low" | "out" | "expiring" | "expired"

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [deletedProducts, setDeletedProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])
  const [filteredDeletedProducts, setFilteredDeletedProducts] = useState<Product[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false)
  const [scannerMode, setScannerMode] = useState<"manual" | "camera">("manual")
  const [currentPageActive, setCurrentPageActive] = useState(1)
  const [currentPageDeleted, setCurrentPageDeleted] = useState(1)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const [includeStockBajo, setIncludeStockBajo] = useState(true)
  const [includePorVencer, setIncludePorVencer] = useState(true)
  const [includeVencidos, setIncludeVencidos] = useState(true)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchFilter, setBranchFilter] = useState<string>("all")
  const [branchPricing, setBranchPricing] = useState<BranchPricingRow[]>([])
  const [skuGroupId, setSkuGroupId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"list" | "grouped">("list")
  const [applyMarkup, setApplyMarkup] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [orderSupplierId, setOrderSupplierId] = useState("")
  const [orderBranchId, setOrderBranchId] = useState("")
  const [orderDraft, setOrderDraft] = useState<OrderDraftItem[]>([])
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [orderProduct, setOrderProduct] = useState<Product | null>(null)
  const [orderQty, setOrderQty] = useState("5")
  const [orderDialogError, setOrderDialogError] = useState<string | null>(null)
  const [newSupplierName, setNewSupplierName] = useState("")
  const [newSupplierPhone, setNewSupplierPhone] = useState("")
  const [creatingSupplier, setCreatingSupplier] = useState(false)
  const [submittingOrder, setSubmittingOrder] = useState(false)
  const [orderMessage, setOrderMessage] = useState<string | null>(null)
  const [layout, setLayout] = useState<"cards" | "table">("cards")
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all")
  const [flash, setFlash] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [savingProduct, setSavingProduct] = useState(false)
  const keepOpenRef = useRef(false)
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    price: "",
    stock_quantity: "",
    min_stock_level: "5",
    category: "",
    image_url: "",
    expiration_date: "",
    days_before_expiry_alert: "30",
    section: "",
    branch_id: "",
  })

  useEffect(() => {
    checkAuth()
    loadBranches()
    loadSuppliers()
  }, [])

  useEffect(() => {
    if (branches.length > 0 || branchFilter === "all") {
      loadProducts()
    }
  }, [branchFilter, branches.length])

  const loadSuppliers = async () => {
    const res = await fetch("/api/suppliers")
    if (!res.ok) return
    const data = await res.json()
    setSuppliers(data.suppliers || [])
    if (data.suppliers?.[0]) {
      setOrderSupplierId((current) => current || data.suppliers[0].id)
    }
  }

  const loadBranches = async () => {
    const res = await fetch("/api/branches")
    if (res.ok) {
      const data = await res.json()
      setBranches(data.branches || [])
      if (!formData.branch_id && data.branches?.[0]) {
        setFormData((prev) => ({ ...prev, branch_id: data.branches[0].id }))
      }
      if (data.branches?.length) {
        setBranchPricing(
          data.branches.map((branch: BranchInfo) => ({
            branch_id: branch.id,
            branch_name: branch.name,
            enabled: branch.id === data.branches[0]?.id,
            price: "",
            cost_price: "",
            stock_quantity: "0",
            min_stock_level: "5",
            promotion_price: "",
            expiration_date: "",
            markup_percent: "",
          })),
        )
      }
    }
  }

  const getBranchName = (product: Product) => {
    if (Array.isArray(product.branches)) return product.branches[0]?.name
    if (product.branches && "name" in product.branches) return product.branches.name
    const branch = branches.find((b) => b.id === product.branch_id)
    return branch?.name || "Sin sucursal"
  }

  const buildDefaultBranchPricing = (preset?: Partial<BranchPricingRow>): BranchPricingRow[] => {
    return branches.map((branch) => ({
      branch_id: branch.id,
      branch_name: branch.name,
      enabled: branchFilter !== "all" ? branch.id === branchFilter : branch.id === branches[0]?.id,
      product_id: undefined,
      price: preset?.price || "",
      cost_price: preset?.cost_price || "",
      stock_quantity: preset?.stock_quantity || "0",
      min_stock_level: preset?.min_stock_level || "5",
      promotion_price: preset?.promotion_price || "",
      expiration_date: preset?.expiration_date || "",
      markup_percent: preset?.markup_percent || "",
    }))
  }

  const loadBranchVariants = async (
    barcode?: string | null,
    groupId?: string | null,
    options?: { preserveLocalEdits?: boolean },
  ) => {
    if (!barcode && !groupId) {
      if (!options?.preserveLocalEdits) {
        setBranchPricing(buildDefaultBranchPricing())
        setSkuGroupId(null)
      }
      return
    }

    const params = groupId ? `sku_group_id=${groupId}` : `barcode=${encodeURIComponent(barcode || "")}`
    try {
      const res = await fetch(`/api/products/branch-variants?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const variants: Product[] = data.variants || []
      setSkuGroupId(data.sku_group_id || null)

      if (variants.length === 0) {
        if (!options?.preserveLocalEdits) {
          setBranchPricing(buildDefaultBranchPricing())
        }
        return
      }

      setBranchPricing((currentRows) =>
        branches.map((branch) => {
          const variant = variants.find((v) => v.branch_id === branch.id)
          const current = currentRows.find((row) => row.branch_id === branch.id)

          if (
            options?.preserveLocalEdits &&
            current &&
            (current.enabled || current.price || current.stock_quantity !== "0")
          ) {
            return {
              ...current,
              product_id: variant?.id || current.product_id,
              branch_name: branch.name,
            }
          }

          return {
            branch_id: branch.id,
            branch_name: branch.name,
            enabled: Boolean(variant) || Boolean(current?.enabled),
            product_id: variant?.id,
            price: variant ? variant.price.toString() : current?.price || "",
            cost_price: variant?.cost_price
              ? variant.cost_price.toString()
              : current?.cost_price || "",
            stock_quantity: variant ? variant.stock_quantity.toString() : current?.stock_quantity || "0",
            min_stock_level: variant ? variant.min_stock_level.toString() : current?.min_stock_level || "5",
            promotion_price: variant?.promotion_price
              ? variant.promotion_price.toString()
              : current?.promotion_price || "",
            expiration_date: variant?.expiration_date || current?.expiration_date || "",
            markup_percent:
              variant?.markup_percent != null
                ? String(variant.markup_percent)
                : current?.markup_percent || "",
          }
        }),
      )
    } catch (error) {
      console.error("Error loading branch variants:", error)
      if (!options?.preserveLocalEdits) {
        setBranchPricing(buildDefaultBranchPricing())
      }
    }
  }

  const updateBranchPricingRow = (branchId: string, updates: Partial<BranchPricingRow>) => {
    setBranchPricing((rows) =>
      rows.map((row) => (row.branch_id === branchId ? { ...row, ...updates } : row)),
    )
  }

  const toggleBranchEnabled = (branchId: string) => {
    setBranchPricing((rows) =>
      rows.map((row) =>
        row.branch_id === branchId
          ? {
              ...row,
              enabled: !row.enabled,
              price:
                !row.enabled && !row.price
                  ? rows.find((r) => r.enabled && r.price)?.price || row.price
                  : row.price,
            }
          : row,
      ),
    )
  }

  useEffect(() => {
    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.section?.toLowerCase().includes(searchTerm.toLowerCase()), 
    )
    setFilteredProducts(filtered)
    setCurrentPageActive(1)

    const filteredDeleted = deletedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.section?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    setFilteredDeletedProducts(filteredDeleted)
    setCurrentPageDeleted(1)

  }, [products, deletedProducts, searchTerm])

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push("/auth/login")
      return
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (profile?.role !== "admin") {
      router.push("/pos")
      return
    }
  }

  const loadProducts = async () => {
    try {
      const branchQuery = branchFilter !== "all" ? `?branch_id=${branchFilter}` : ""
      const response = await fetch(`/api/products${branchQuery}`)
      const { products: data } = await response.json()

      const allProducts = data || []
      const activeProds = allProducts.filter((p: any) => p.is_active !== false)
      const inactiveProds = allProducts.filter((p: any) => p.is_active === false)

      setProducts(activeProds)
      setDeletedProducts(inactiveProds)
      setCurrentPageActive(1)
      setCurrentPageDeleted(1)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (productId: string) => {
    if (!confirm("¿Estás seguro de que quieres recuperar este producto?")) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from("products").update({ is_active: true }).eq("id", productId)

      if (error) throw error

      // REGISTRO EN BITÁCORA
      if (user) {
        await supabase.from("stock_movements").insert({
          product_id: productId,
          user_id: user.id,
          movement_type: 'ajuste',
          quantity: 0,
          reason: 'Producto restaurado (reactivado) desde panel admin',
        })
      }

      loadProducts()
      alert("Producto recuperado exitosamente")
    } catch (error) {
      console.error("Error restoring product:", error)
      alert("Error al recuperar el producto")
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const keepOpen = keepOpenRef.current && !editingProduct
    keepOpenRef.current = false
    if (savingProduct) return

    if (!formData.name.trim()) {
      alert("El nombre del producto es requerido")
      return
    }

    const enabledRows = branchPricing.filter((row) => row.enabled)
    if (enabledRows.length === 0) {
      alert("Activa al menos una sucursal con precio y stock")
      return
    }

    for (const row of enabledRows) {
      if (!row.price || Number.parseFloat(row.price) <= 0) {
        alert(`Ingresa un precio válido para ${row.branch_name}`)
        return
      }
      if (row.stock_quantity === "" || Number.parseInt(row.stock_quantity) < 0) {
        alert(`Ingresa stock válido para ${row.branch_name}`)
        return
      }
    }

    setSavingProduct(true)
    try {
      const payload = {
        sku_group_id: skuGroupId,
        shared: {
          name: formData.name,
          description: formData.description,
          barcode: formData.barcode || null,
          category: formData.category,
          image_url: formData.image_url || null,
          section: formData.section || null,
          days_before_expiry_alert: formData.days_before_expiry_alert
            ? Number.parseInt(formData.days_before_expiry_alert)
            : 30,
          apply_markup: applyMarkup,
        },
        branches: branchPricing.map((row) => ({
          branch_id: row.branch_id,
          product_id: row.product_id || null,
          enabled: row.enabled,
          price: row.enabled ? Number.parseFloat(row.price) : 0,
          cost_price: row.enabled ? Number.parseFloat(row.cost_price || "0") : 0,
          stock_quantity: row.enabled ? Number.parseInt(row.stock_quantity) : 0,
          min_stock_level: row.enabled ? Number.parseInt(row.min_stock_level || "5") : 5,
          promotion_price: row.promotion_price ? Number.parseFloat(row.promotion_price) : null,
          expiration_date: row.expiration_date || null,
          markup_percent: row.markup_percent === "" ? null : Number.parseFloat(row.markup_percent),
        })),
      }

      const res = await fetch("/api/products/branch-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await res.json()
      if (!res.ok) {
        alert(result.error || "Error al guardar el producto")
        return
      }

      setFlash(
        editingProduct
          ? `"${formData.name}" actualizado en todas las sucursales`
          : `"${formData.name}" registrado correctamente`,
      )

      setFormData({
        name: "",
        description: "",
        barcode: "",
        price: "",
        stock_quantity: "",
        min_stock_level: "5",
        category: "",
        image_url: "",
        expiration_date: "",
        days_before_expiry_alert: "30",
        section: "",
        branch_id: branches[0]?.id || "",
      })
      setBranchPricing(buildDefaultBranchPricing())
      setSkuGroupId(null)
      setApplyMarkup(false)
      setFormKey((k) => k + 1)
      setEditingProduct(null)
      if (keepOpen) {
        setTimeout(() => barcodeInputRef.current?.focus(), 60)
      } else {
        setIsAddDialogOpen(false)
      }
      loadProducts()
    } catch (error) {
      console.error("Unexpected error saving product:", error)
      alert("Error inesperado al guardar el producto")
    } finally {
      setSavingProduct(false)
    }
  }

  const openNewProduct = () => {
    setEditingProduct(null)
    setSkuGroupId(null)
    setApplyMarkup(false)
    setBranchPricing(buildDefaultBranchPricing())
    setFormData({
      name: "",
      description: "",
      barcode: "",
      price: "",
      stock_quantity: "",
      min_stock_level: "5",
      category: "",
      image_url: "",
      expiration_date: "",
      days_before_expiry_alert: "30",
      section: "",
      branch_id: branches[0]?.id || "",
    })
    setFormKey((k) => k + 1)
    setIsAddDialogOpen(true)
  }

  const enableAllBranches = () => {
    setBranchPricing((rows) => {
      const source = rows.find((r) => r.enabled && r.price)
      return rows.map((row) =>
        row.enabled ? row : { ...row, enabled: true, price: row.price || source?.price || "" },
      )
    })
  }

  const copyFirstBranchToAll = () => {
    setBranchPricing((rows) => {
      const source = rows.find((r) => r.enabled)
      if (!source) return rows
      return rows.map((row) =>
        row.enabled && row.branch_id !== source.branch_id
          ? {
              ...row,
              cost_price: source.cost_price,
              price: source.price,
              markup_percent: source.markup_percent,
              promotion_price: source.promotion_price,
              min_stock_level: source.min_stock_level,
              expiration_date: source.expiration_date,
            }
          : row,
      )
    })
  }

  const handleEdit = async (product: Product) => {
    setFormData({
      name: product.name,
      description: product.description || "",
      barcode: product.barcode || "",
      price: product.price.toString(),
      stock_quantity: product.stock_quantity.toString(),
      min_stock_level: product.min_stock_level.toString(),
      category: product.category || "",
      image_url: product.image_url || "",
      expiration_date: product.expiration_date || "",
      days_before_expiry_alert: product.days_before_expiry_alert?.toString() || "30",
      section: product.section || "",
      branch_id: product.branch_id || branches[0]?.id || "",
    })
    setEditingProduct(product)
    await loadBranchVariants(product.barcode, product.sku_group_id)
    setIsAddDialogOpen(true)
  }

  const handleDelete = async (productId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este producto?")) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from("products").update({ is_active: false }).eq("id", productId)

      if (error) throw error

      // REGISTRO EN BITÁCORA
      if (user) {
        await supabase.from("stock_movements").insert({
          product_id: productId,
          user_id: user.id,
          movement_type: 'ajuste',
          quantity: 0,
          reason: 'Producto marcado como inactivo/eliminado por admin',
        })
      }

      loadProducts()
    } catch (error) {
      console.error("Error deleting product:", error)
      alert("Error al eliminar el producto")
    }
  }

  const generateBarcode = () => {
    const barcode = Date.now().toString()
    setFormData({ ...formData, barcode })
  }

  const handleImageUploaded = (url: string) => {
    setFormData({ ...formData, image_url: url })
  }

  const handleQrScan = (scannedCode: string) => {
    setFormData({ ...formData, barcode: scannedCode })
    setIsQrScannerOpen(false)
  }

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const input = form.elements.namedItem("manualCode") as HTMLInputElement
    if (input.value.trim()) {
      handleQrScan(input.value.trim())
    }
  }

  const getExpirationStatus = (product: Product) => {
    if (!product.expiration_date) return null

    const today = new Date()
    const expirationDate = new Date(product.expiration_date)
    const daysUntilExpiry = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    const alertThreshold = product.days_before_expiry_alert || 30

    if (daysUntilExpiry < 0) {
      return { status: "expired", days: Math.abs(daysUntilExpiry), variant: "destructive" as const }
    } else if (daysUntilExpiry <= alertThreshold) {
      return { status: "expiring", days: daysUntilExpiry, variant: "secondary" as const }
    }
    return null
  }

  const openAddToOrder = (product: Product) => {
    const min = product.min_stock_level || 5
    const suggested = Math.max(1, min - (product.stock_quantity || 0))
    setOrderProduct(product)
    setOrderQty(String(suggested))
    setOrderBranchId(product.branch_id || branches[0]?.id || "")
    setOrderDialogError(null)
    setOrderMessage(null)
    setOrderDialogOpen(true)
  }

  const resolveProductForBranch = (product: Product, branchId: string) => {
    if (product.branch_id === branchId) {
      return {
        product_id: product.id,
        product_name: product.name,
        barcode: product.barcode || null,
        image_url: product.image_url || null,
        stock_quantity: product.stock_quantity,
      }
    }
    const sibling = products.find(
      (p) =>
        p.branch_id === branchId &&
        p.is_active !== false &&
        ((product.barcode && p.barcode === product.barcode) ||
          (product.sku_group_id && p.sku_group_id === product.sku_group_id) ||
          p.name.toLowerCase() === product.name.toLowerCase()),
    )
    if (sibling) {
      return {
        product_id: sibling.id,
        product_name: sibling.name,
        barcode: sibling.barcode || product.barcode || null,
        image_url: sibling.image_url || product.image_url || null,
        stock_quantity: sibling.stock_quantity,
      }
    }
    return {
      product_id: product.id,
      product_name: product.name,
      barcode: product.barcode || null,
      image_url: product.image_url || null,
      stock_quantity: product.stock_quantity,
    }
  }

  const addProductToDraft = () => {
    if (!orderProduct) return
    if (!orderBranchId) {
      setOrderDialogError("Elige la sucursal del pedido")
      return
    }
    if (!orderSupplierId) {
      setOrderDialogError("Elige o crea un proveedor")
      return
    }
    const quantity = Math.max(1, Number.parseInt(orderQty || "1") || 1)
    const branch = branches.find((b) => b.id === orderBranchId)
    const resolved = resolveProductForBranch(orderProduct, orderBranchId)
    const key = `${resolved.product_id}-${orderBranchId}-${orderSupplierId}`
    setOrderDraft((prev) => {
      const existing = prev.find((item) => item.key === key)
      if (existing) {
        return prev.map((item) =>
          item.key === key ? { ...item, quantity: item.quantity + quantity } : item,
        )
      }
      return [
        ...prev,
        {
          key,
          product_id: resolved.product_id,
          product_name: resolved.product_name,
          barcode: resolved.barcode,
          branch_id: orderBranchId,
          branch_name: branch?.name || "Sucursal",
          quantity,
          image_url: resolved.image_url,
          stock_quantity: resolved.stock_quantity,
        },
      ]
    })
    setOrderDialogOpen(false)
    setOrderProduct(null)
    setOrderDialogError(null)
    setOrderMessage(
      `Agregado: ${orderProduct.name} · ${branch?.name || "sucursal"} · proveedor ${
        suppliers.find((s) => s.id === orderSupplierId)?.name || ""
      }`,
    )
  }

  const createSupplierFromProducts = async () => {
    if (!newSupplierName.trim()) {
      setOrderDialogError("Escribe el nombre del proveedor")
      return
    }
    setCreatingSupplier(true)
    setOrderDialogError(null)
    setOrderMessage(null)
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSupplierName, phone: newSupplierPhone }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.hint ? `${json.error}. ${json.hint}` : json.error || "No se pudo crear")
      setSuppliers((prev) => [...prev, json.supplier].sort((a, b) => a.name.localeCompare(b.name, "es")))
      setOrderSupplierId(json.supplier.id)
      setNewSupplierName("")
      setNewSupplierPhone("")
      setOrderMessage(`Proveedor creado: ${json.supplier.name}`)
    } catch (err) {
      setOrderDialogError(err instanceof Error ? err.message : "Error al crear proveedor")
    } finally {
      setCreatingSupplier(false)
    }
  }

  const submitOrderDraft = async () => {
    if (!orderSupplierId) {
      setOrderMessage("Elige o crea un proveedor")
      return
    }
    if (orderDraft.length === 0) {
      setOrderMessage("Agrega productos al pedido desde Acciones")
      return
    }
    setSubmittingOrder(true)
    setOrderMessage(null)
    try {
      const byBranch = new Map<string, OrderDraftItem[]>()
      for (const item of orderDraft) {
        const list = byBranch.get(item.branch_id) || []
        list.push(item)
        byBranch.set(item.branch_id, list)
      }
      const created: string[] = []
      for (const [branchId, rows] of byBranch) {
        const res = await fetch("/api/supply-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            branch_id: branchId,
            supplier_id: orderSupplierId,
            notes: "Pedido desde Productos",
            items: rows.map((row) => ({
              product_id: row.product_id,
              product_name: row.product_name,
              barcode: row.barcode,
              quantity: row.quantity,
              photo_url: row.image_url,
            })),
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "No se pudo guardar el pedido")
        created.push(json.request?.request_number || "Pedido")
      }
      setOrderDraft([])
      setOrderMessage(`Pedido enviado: ${created.join(", ")}`)
    } catch (err) {
      setOrderMessage(err instanceof Error ? err.message : "Error al enviar pedido")
    } finally {
      setSubmittingOrder(false)
    }
  }

  const getUniqueSections = () => {
    const sections = new Set<string>()
    products.forEach((product) => {
      sections.add(product.section || "SIN SECCIÓN")
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
    setSelectedSections(getUniqueSections()) // Select all by default
    setIncludeStockBajo(true)
    setIncludePorVencer(true)
    setIncludeVencidos(true)
    setIsExportDialogOpen(true)
  }

  const generateStockReport = () => {
    const filteredBySection = products.filter((product) => {
      const productSection = product.section || "SIN SECCIÓN"
      return selectedSections.includes(productSection)
    })

    const productsBySection = filteredBySection.reduce((acc: Record<string, any[]>, product) => {
      const section = product.section || "SIN SECCIÓN"
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
    receipt += doubleLine() + "\n\n"

    sortedSections.forEach((section) => {
      const sectionProducts = productsBySection[section]

      receipt += center(`[ SECCION ${section} ]`) + "\n"
      receipt += line() + "\n"
      receipt += pad("PRODUCTO", 30) + pad("STK", 6, "right") + pad("PREC", 6, "right") + "\n"
      receipt += line("-") + "\n"

      sectionProducts.forEach((product: Product) => {
        const expirationStatus = getExpirationStatus(product)
        let name = product.name.substring(0, 28)
        if (expirationStatus?.status === "expired") {
          name += " *V*"
        } else if (expirationStatus?.status === "expiring") {
          name += " !"
        }
        if (product.stock_quantity <= product.min_stock_level) {
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
      const lowStockProducts = filteredBySection.filter((p) => p.stock_quantity <= p.min_stock_level)
      receipt += center("[ STOCK BAJO ]") + "\n"
      receipt += line() + "\n"
      if (lowStockProducts.length > 0) {
        lowStockProducts.forEach((product) => {
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
      const expiringProducts = filteredBySection.filter((p) => {
        const status = getExpirationStatus(p)
        return status && status.status === "expiring"
      })
      receipt += center("[ POR VENCER ]") + "\n"
      receipt += line() + "\n"
      if (expiringProducts.length > 0) {
        expiringProducts.forEach((product) => {
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
      const expiredProducts = filteredBySection.filter((p) => {
        const status = getExpirationStatus(p)
        return status && status.status === "expired"
      })
      receipt += center("[ VENCIDOS ]") + "\n"
      receipt += line() + "\n"
      if (expiredProducts.length > 0) {
        expiredProducts.forEach((product) => {
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
    receipt += `Stock bajo: ${pad(filteredBySection.filter((p) => p.stock_quantity <= p.min_stock_level).length.toString(), 23, "right")}\n`
    receipt += `Por vencer: ${pad(
      filteredBySection
        .filter((p) => {
          const s = getExpirationStatus(p)
          return s && s.status === "expiring"
        })
        .length.toString(),
      23,
      "right",
    )}\n`
    receipt += `Vencidos: ${pad(
      filteredBySection
        .filter((p) => {
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

  const matchesQuickFilter = (product: Product, filter: QuickFilter) => {
    if (filter === "all") return true
    if (filter === "low") return product.stock_quantity > 0 && product.stock_quantity <= product.min_stock_level
    if (filter === "out") return product.stock_quantity <= 0
    const status = getExpirationStatus(product)?.status
    return filter === "expiring" ? status === "expiring" : status === "expired"
  }

  const stats = useMemo(() => {
    let units = 0
    let costValue = 0
    let saleValue = 0
    const counts: Record<QuickFilter, number> = { all: products.length, low: 0, out: 0, expiring: 0, expired: 0 }
    for (const p of products) {
      const qty = Math.max(0, Number(p.stock_quantity) || 0)
      units += qty
      costValue += qty * Number(p.cost_price || 0)
      saleValue += qty * Number(p.price || 0)
      for (const key of ["low", "out", "expiring", "expired"] as const) {
        if (matchesQuickFilter(p, key)) counts[key]++
      }
    }
    return { units, costValue, saleValue, counts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  const displayProducts = useMemo(
    () => (quickFilter === "all" ? filteredProducts : filteredProducts.filter((p) => matchesQuickFilter(p, quickFilter))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredProducts, quickFilter],
  )

  const groupedByBarcode = useMemo(() => {
    if (branchFilter !== "all" || viewMode !== "grouped") return []
    const map = new Map<string, Product[]>()
    for (const product of displayProducts) {
      const key = product.barcode?.trim() || product.sku_group_id || product.id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(product)
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }, [displayProducts, branchFilter, viewMode])

  const applyQuickFilter = (filter: QuickFilter) => {
    setQuickFilter((prev) => (prev === filter ? "all" : filter))
    setCurrentPageActive(1)
  }

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      if (isAddDialogOpen || isQrScannerOpen || isExportDialogOpen || orderDialogOpen) return
      if (e.key === "/") {
        e.preventDefault()
        searchInputRef.current?.focus()
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault()
        openNewProduct()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const totalPagesActive = Math.ceil(displayProducts.length / PRODUCTS_PER_PAGE)
  const startIndexActive = (currentPageActive - 1) * PRODUCTS_PER_PAGE
  const endIndexActive = startIndexActive + PRODUCTS_PER_PAGE
  const paginatedActiveProducts = displayProducts.slice(startIndexActive, endIndexActive)

  const totalPagesDeleted = Math.ceil(filteredDeletedProducts.length / PRODUCTS_PER_PAGE)
  const startIndexDeleted = (currentPageDeleted - 1) * PRODUCTS_PER_PAGE
  const endIndexDeleted = startIndexDeleted + PRODUCTS_PER_PAGE
  const paginatedDeletedProducts = filteredDeletedProducts.slice(startIndexDeleted, endIndexDeleted)

  if (loading) {
    return (
      <div className="min-h-screen space-y-5 px-3 pt-3 sm:px-6 lg:px-8 lg:pt-6">
        <div className="bento h-20 animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="bento-accent h-44 animate-pulse lg:col-span-5" />
          <div className="grid grid-cols-2 gap-4 lg:col-span-7 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bento h-44 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bento h-72 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const hasOrderBar = orderDraft.length > 0
  const isGrouped = viewMode === "grouped" && branchFilter === "all"
  const currentBranchName =
    branchFilter === "all" ? "todas las sucursales" : branches.find((b) => b.id === branchFilter)?.name || "sucursal"
  const selectedSupplierName = suppliers.find((s) => s.id === orderSupplierId)?.name

  const formEnabledRows = branchPricing.filter((r) => r.enabled)
  const formTotalStock = formEnabledRows.reduce((sum, r) => sum + (Number.parseInt(r.stock_quantity) || 0), 0)
  const formPrices = formEnabledRows.map((r) => Number.parseFloat(r.price)).filter((n) => n > 0)

  const renderThumb = (product: Product, size = "h-12 w-12") => (
    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-muted/70", size)}>
      {product.image_url ? (
        <img src={product.image_url || "/placeholder.svg"} alt={product.name} className="h-full w-full object-cover" />
      ) : (
        <Package className="h-5 w-5 text-muted-foreground/60" />
      )}
    </div>
  )

  const renderProductCard = (product: Product, index: number) => {
    const expiration = getExpirationStatus(product)
    const price = Number(product.price)
    const cost = Number(product.cost_price || 0)
    const profit = price - cost
    const out = product.stock_quantity <= 0
    const low = !out && product.stock_quantity <= product.min_stock_level
    const stockPct = Math.min(100, (Math.max(0, product.stock_quantity) / Math.max(product.min_stock_level * 3, 1)) * 100)
    const promo = Number(product.promotion_price || 0)

    return (
      <div
        key={product.id}
        className="bento bento-hover anim-rise-sm group flex flex-col overflow-hidden"
        style={stagger(Math.min(index, 14))}
      >
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-muted/80 to-muted/30">
          {product.image_url ? (
            <img
              src={product.image_url || "/placeholder.svg"}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Package className="h-10 w-10 text-muted-foreground/35" />
            </div>
          )}
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
            {product.section && (
              <span className="rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-bold tracking-wide shadow-sm backdrop-blur">
                {product.section}
              </span>
            )}
            {promo > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-sm">
                Promo
              </span>
            )}
          </div>
          <div className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1">
            {out && <StatusPill tone="rose">Agotado</StatusPill>}
            {low && <StatusPill tone="amber">Stock bajo</StatusPill>}
            {expiration && (
              <StatusPill tone={expiration.status === "expired" ? "red" : "orange"}>
                {expiration.status === "expired" ? `Vencido ${expiration.days}d` : `Vence en ${expiration.days}d`}
              </StatusPill>
            )}
          </div>
          <div className="absolute inset-x-2.5 bottom-2.5 flex translate-y-2 justify-end gap-1.5 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full bg-background/95 shadow-md"
              title="Agregar a pedido"
              onClick={() => openAddToOrder(product)}
            >
              <PackagePlus className="h-4 w-4 text-emerald-700" />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="h-8 w-8 rounded-full bg-background/95 shadow-md"
              title="Eliminar"
              onClick={() => handleDelete(product.id)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="min-w-0">
            <p className="line-clamp-2 font-semibold leading-snug" title={product.name}>
              {product.name}
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {product.barcode || "Sin código"}
              {product.category ? ` · ${product.category}` : ""}
            </p>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-xl font-bold tabular-nums leading-none text-primary">{formatMoney(price)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Costo {formatMoney(cost)}
                {cost > 0 && (
                  <span className={cn("ml-1 font-semibold", profit >= 0 ? "text-emerald-700" : "text-destructive")}>
                    {profit >= 0 ? "+" : ""}
                    {markupPercent(price, cost).toFixed(0)}%
                  </span>
                )}
              </p>
              {promo > 0 && <p className="text-[11px] font-semibold text-primary">Promo {formatMoney(promo)}</p>}
            </div>
            <Badge variant="outline" className="max-w-[45%] truncate rounded-full text-[10px]">
              {getBranchName(product)}
            </Badge>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="font-semibold tabular-nums">
                {product.stock_quantity} <span className="font-normal text-muted-foreground">pzas</span>
              </span>
              <span className="text-muted-foreground">mín. {product.min_stock_level}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "anim-grow-x h-full rounded-full",
                  out ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500",
                )}
                style={{ width: `${Math.max(out ? 0 : 6, stockPct)}%` }}
              />
            </div>
          </div>

          <div className="mt-auto flex gap-2 pt-1">
            <Button size="sm" className="press h-9 flex-1 rounded-xl" onClick={() => handleEdit(product)}>
              <Edit className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-9 rounded-xl px-2.5" aria-label="Más acciones">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => openAddToOrder(product)}>
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Agregar a pedido
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEdit(product)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDelete(product.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <AdminPageHeader
        title="Gestión de Productos"
        subtitle="Catálogo, precios por sucursal y pedidos"
        icon={Package}
        actions={
          <>
            <Magnetic strength={0.2}>
              <Button size="sm" className="shine press rounded-xl" onClick={openNewProduct}>
                <Plus className="mr-1 h-4 w-4" />
                Nuevo producto
                <kbd className="ml-2 hidden rounded bg-white/20 px-1.5 text-[10px] font-semibold lg:inline">N</kbd>
              </Button>
            </Magnetic>
            <Button
              size="sm"
              variant="outline"
              className="press rounded-xl"
              onClick={() => router.push("/admin/products/agregado-rapido")}
            >
              <Zap className="mr-1 h-4 w-4 text-amber-500" />
              <span className="hidden sm:inline">Agregado rápido</span>
              <span className="sm:hidden">Rápido</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-xl">
                  Más
                  <ChevronDown className="ml-1 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={openExportDialog}>
                  <Printer className="mr-2 h-4 w-4" />
                  Exportar inventario
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/admin/inventario/pedido")}>
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Pedir stock 0
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/admin/pedidos-globales")}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  Ver pedidos
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {flash && (
        <div className="anim-pop fixed right-4 top-4 z-[60] flex max-w-sm items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-xl">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">{flash}</span>
          <button type="button" className="rounded-full p-0.5 hover:bg-white/20" onClick={() => setFlash(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={cn("space-y-5 p-4 sm:p-6 lg:px-8", hasOrderBar && "pb-44")}>
        <section className="grid gap-4 lg:grid-cols-12">
          <div className="bento-accent anim-rise relative overflow-hidden p-5 sm:p-6 lg:col-span-5">
            <div className="pattern-rings pointer-events-none absolute inset-0" />
            <div className="relative flex h-full flex-col justify-between gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">Catálogo activo</p>
                  <p className="mt-1 text-5xl font-bold tabular-nums leading-none">
                    <CountUp value={products.length} />
                  </p>
                  <p className="mt-1 text-sm text-white/75">productos en {currentBranchName}</p>
                </div>
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                  <Boxes className="h-6 w-6" />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-2xl bg-white/10 p-2.5">
                  <p className="text-white/65">Piezas</p>
                  <p className="text-base font-bold tabular-nums">
                    <CountUp value={stats.units} />
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 p-2.5">
                  <p className="text-white/65">Valor costo</p>
                  <p className="truncate text-base font-bold tabular-nums">
                    <CountUp value={stats.costValue} format={(n) => formatMoney(n).replace(/\.\d+$/, "")} />
                  </p>
                </div>
                <div className="rounded-2xl bg-white/10 p-2.5">
                  <p className="text-white/65">Valor venta</p>
                  <p className="truncate text-base font-bold tabular-nums">
                    <CountUp value={stats.saleValue} format={(n) => formatMoney(n).replace(/\.\d+$/, "")} />
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  className="press rounded-xl bg-white text-primary hover:bg-white/90"
                  onClick={openNewProduct}
                >
                  <ScanBarcode className="mr-1.5 h-4 w-4" />
                  Escanear y agregar
                </Button>
                <span className="hidden text-[11px] text-white/60 sm:inline">
                  Atajos: <kbd className="rounded bg-white/15 px-1">N</kbd> nuevo ·{" "}
                  <kbd className="rounded bg-white/15 px-1">/</kbd> buscar
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:col-span-7">
            <FilterTile
              icon={AlertTriangle}
              label="Stock bajo"
              hint="Toca para filtrar"
              value={stats.counts.low}
              tone="amber"
              active={quickFilter === "low"}
              onClick={() => applyQuickFilter("low")}
              index={1}
            />
            <FilterTile
              icon={PackageX}
              label="Agotados"
              hint="Sin piezas"
              value={stats.counts.out}
              tone="rose"
              active={quickFilter === "out"}
              onClick={() => applyQuickFilter("out")}
              index={2}
            />
            <FilterTile
              icon={CalendarClock}
              label="Por vencer"
              hint="Dentro de su alerta"
              value={stats.counts.expiring}
              tone="orange"
              active={quickFilter === "expiring"}
              onClick={() => applyQuickFilter("expiring")}
              index={3}
            />
            <FilterTile
              icon={CalendarX}
              label="Vencidos"
              hint="Retirar de anaquel"
              value={stats.counts.expired}
              tone="red"
              active={quickFilter === "expired"}
              onClick={() => applyQuickFilter("expired")}
              index={4}
            />
          </div>
        </section>

        <section className="bento anim-rise-sm p-3" style={stagger(5)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Buscar por nombre, código, categoría o sección…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11 rounded-xl border-transparent bg-muted/50 pl-10 pr-12 focus-visible:bg-background"
              />
              {searchTerm ? (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpiar búsqueda"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border bg-background px-1.5 text-[11px] text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </div>

            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-11 w-full rounded-xl lg:w-60">
                <Store className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Filtrar por sucursal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap gap-2">
              {branchFilter === "all" && (
                <Segmented
                  value={viewMode}
                  onChange={setViewMode}
                  options={[
                    { value: "list", label: "Por fila", icon: Package },
                    { value: "grouped", label: "Agrupado", icon: Layers },
                  ]}
                />
              )}
              {!isGrouped && (
                <Segmented
                  value={layout}
                  onChange={setLayout}
                  options={[
                    { value: "cards", label: "Tarjetas", icon: LayoutGrid },
                    { value: "table", label: "Tabla", icon: List },
                  ]}
                />
              )}
            </div>
          </div>

          {quickFilter !== "all" && (
            <div className="anim-rise-sm mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
              <span className="text-muted-foreground">Filtro rápido:</span>
              <button
                type="button"
                onClick={() => applyQuickFilter(quickFilter)}
                className="press inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
              >
                {QUICK_FILTER_LABEL[quickFilter]}
                <X className="h-3 w-3" />
              </button>
              <span className="text-muted-foreground">
                {displayProducts.length} de {filteredProducts.length} productos
              </span>
            </div>
          )}
        </section>

        <details className="bento anim-rise-sm group overflow-hidden" style={stagger(6)}>
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
              <Truck className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Pedido con proveedor</p>
              <p className="truncate text-xs text-muted-foreground">
                {selectedSupplierName ? `Proveedor: ${selectedSupplierName}` : "Elige o crea el proveedor del pedido"} ·
                usa “Agregar a pedido” en cada producto
              </p>
            </div>
            <Badge variant="secondary" className="hidden rounded-full sm:inline-flex">
              {suppliers.length} proveedores
            </Badge>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 gap-2 border-t bg-emerald-50/40 p-4 lg:grid-cols-[1fr_1fr_auto]">
            <Select value={orderSupplierId || undefined} onValueChange={setOrderSupplierId}>
              <SelectTrigger className="h-10 rounded-xl bg-background">
                <SelectValue placeholder="Seleccionar proveedor" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                className="h-10 rounded-xl bg-background"
                placeholder="Nuevo proveedor"
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
              />
              <Input
                className="h-10 rounded-xl bg-background"
                placeholder="Teléfono"
                value={newSupplierPhone}
                onChange={(e) => setNewSupplierPhone(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl bg-background"
              disabled={creatingSupplier || !newSupplierName.trim()}
              onClick={createSupplierFromProducts}
            >
              <Plus className="mr-1 h-4 w-4" />
              {creatingSupplier ? "Creando..." : "Crear proveedor"}
            </Button>
          </div>
        </details>

        {orderMessage ? (
          <div className="anim-rise-sm flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
            <Truck className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{orderMessage}</span>
            <button type="button" onClick={() => setOrderMessage(null)} className="rounded-full p-0.5 hover:bg-emerald-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="h-auto rounded-2xl bg-muted/60 p-1">
            <TabsTrigger value="active" className="gap-2 rounded-xl px-4 py-2 data-[state=active]:shadow-sm">
              <Package className="h-4 w-4" />
              Activos
              <span className="rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">{products.length}</span>
            </TabsTrigger>
            <TabsTrigger value="deleted" className="gap-2 rounded-xl px-4 py-2 data-[state=active]:shadow-sm">
              <Archive className="h-4 w-4" />
              Eliminados
              <span className="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">
                {deletedProducts.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              {isGrouped ? (
                <span>
                  {groupedByBarcode.length} productos agrupados · {displayProducts.length} registros por sucursal
                </span>
              ) : (
                <span>
                  Mostrando{" "}
                  <b className="text-foreground">
                    {displayProducts.length === 0 ? 0 : startIndexActive + 1}-
                    {Math.min(endIndexActive, displayProducts.length)}
                  </b>{" "}
                  de {displayProducts.length} productos
                  {searchTerm && ` (filtrados de ${products.length} totales)`}
                </span>
              )}
            </div>

            {isGrouped ? (
              groupedByBarcode.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="No hay productos para agrupar"
                  text="Prueba con otra búsqueda o quita el filtro rápido."
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {groupedByBarcode.map(({ key, items }, i) => {
                    const first = items[0]
                    const totalStock = items.reduce((sum, p) => sum + (p.stock_quantity || 0), 0)
                    return (
                      <div
                        key={key}
                        className="bento bento-hover anim-rise-sm flex flex-col gap-3 p-4"
                        style={stagger(Math.min(i, 14))}
                      >
                        <div className="flex items-start gap-3">
                          {renderThumb(first, "h-14 w-14")}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 font-semibold leading-snug">{first?.name}</p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {first?.barcode || "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold tabular-nums leading-none">{totalStock}</p>
                            <p className="text-[10px] text-muted-foreground">pzas total</p>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {items.map((p) => {
                            const out = p.stock_quantity <= 0
                            const low = !out && p.stock_quantity <= p.min_stock_level
                            return (
                              <div
                                key={p.id}
                                className="flex items-center gap-2 rounded-xl bg-muted/45 px-3 py-1.5 text-xs"
                              >
                                <span
                                  className={cn(
                                    "h-2 w-2 shrink-0 rounded-full",
                                    out ? "bg-rose-500" : low ? "bg-amber-500" : "bg-emerald-500",
                                  )}
                                />
                                <span className="min-w-0 flex-1 truncate font-medium">{getBranchName(p)}</span>
                                <span className="font-semibold tabular-nums">{formatMoney(p.price)}</span>
                                <span className="w-16 text-right tabular-nums text-muted-foreground">
                                  {p.stock_quantity} pzas
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        <div className="mt-auto flex gap-2">
                          <Button size="sm" className="press h-9 flex-1 rounded-xl" onClick={() => handleEdit(first)}>
                            <Edit className="mr-1.5 h-3.5 w-3.5" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-xl text-emerald-700"
                            onClick={() => openAddToOrder(first)}
                            title="Agregar a pedido"
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : displayProducts.length === 0 ? (
              <EmptyState
                icon={searchTerm || quickFilter !== "all" ? Search : Package}
                title={
                  searchTerm || quickFilter !== "all" ? "No se encontraron productos" : "No hay productos registrados"
                }
                text={
                  searchTerm || quickFilter !== "all"
                    ? "Ajusta la búsqueda o quita el filtro rápido."
                    : "Agrega tu primer producto escaneando su código."
                }
                action={
                  !searchTerm && quickFilter === "all" ? (
                    <Button className="shine press rounded-xl" onClick={openNewProduct}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Nuevo producto
                    </Button>
                  ) : undefined
                }
              />
            ) : layout === "cards" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {paginatedActiveProducts.map((product, i) => renderProductCard(product, i))}
              </div>
            ) : (
              <div className="bento anim-rise-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Costo</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Ganancia</TableHead>
                        <TableHead className="text-right">Aumento</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Sucursal</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Sección</TableHead>
                        <TableHead>Caducidad</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedActiveProducts.map((product) => {
                        const expirationStatus = getExpirationStatus(product)
                        const price = Number(product.price)
                        const cost = Number(product.cost_price || 0)
                        const out = product.stock_quantity <= 0
                        const low = product.stock_quantity <= product.min_stock_level

                        return (
                          <TableRow key={product.id}>
                            <TableCell>
                              <div className="flex min-w-[220px] items-center gap-3">
                                {renderThumb(product, "h-10 w-10")}
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{product.name}</p>
                                  {product.description && (
                                    <p className="truncate text-xs text-muted-foreground">{product.description}</p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{product.barcode || "Sin código"}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatMoney(cost)}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{formatMoney(price)}</TableCell>
                            <TableCell
                              className={cn(
                                "text-right tabular-nums",
                                price - cost >= 0 ? "text-emerald-700" : "text-destructive",
                              )}
                            >
                              {formatMoney(price - cost)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {cost > 0 ? `${(((price - cost) / cost) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold tabular-nums">{product.stock_quantity}</span>
                                {low && <StatusPill tone={out ? "rose" : "amber"}>{out ? "Agotado" : "Bajo"}</StatusPill>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="rounded-full">
                                {getBranchName(product)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{product.category || "Sin categoría"}</TableCell>
                            <TableCell className="text-sm">{product.section || "Sin sección"}</TableCell>
                            <TableCell>
                              {product.expiration_date ? (
                                <div className="flex flex-col gap-1">
                                  <span className="text-sm">
                                    {new Date(product.expiration_date).toLocaleDateString("es-ES")}
                                  </span>
                                  {expirationStatus && (
                                    <StatusPill tone={expirationStatus.status === "expired" ? "red" : "orange"}>
                                      {expirationStatus.status === "expired"
                                        ? `Vencido hace ${expirationStatus.days}d`
                                        : `${expirationStatus.days}d restantes`}
                                    </StatusPill>
                                  )}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">Sin fecha</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <StatusPill tone="emerald">Activo</StatusPill>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg"
                                  title="Editar"
                                  onClick={() => handleEdit(product)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg text-emerald-700"
                                  title="Agregar a pedido"
                                  onClick={() => openAddToOrder(product)}
                                >
                                  <PackagePlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 rounded-lg text-destructive"
                                  title="Eliminar"
                                  onClick={() => handleDelete(product.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {!isGrouped && displayProducts.length > PRODUCTS_PER_PAGE && (
              <Pager page={currentPageActive} totalPages={totalPagesActive} onChange={setCurrentPageActive} />
            )}
          </TabsContent>

          <TabsContent value="deleted" className="mt-4 space-y-4">
            <div className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Mostrando{" "}
                <b className="text-foreground">
                  {filteredDeletedProducts.length === 0 ? 0 : startIndexDeleted + 1}-
                  {Math.min(endIndexDeleted, filteredDeletedProducts.length)}
                </b>{" "}
                de {filteredDeletedProducts.length} productos eliminados
                {searchTerm && ` (filtrados de ${deletedProducts.length} totales)`}
              </span>
              <span className="text-xs">Se conservan por tener ventas registradas. Puedes recuperarlos aquí.</span>
            </div>

            {filteredDeletedProducts.length === 0 ? (
              <EmptyState
                icon={Archive}
                title={searchTerm ? "No se encontraron productos eliminados" : "No hay productos eliminados"}
                text="Los productos que elimines aparecerán aquí para recuperarlos."
              />
            ) : (
              <div className="bento anim-rise-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead>Código</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Sección</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedDeletedProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="flex min-w-[220px] items-center gap-3 opacity-70">
                              {renderThumb(product, "h-10 w-10 grayscale")}
                              <div className="min-w-0">
                                <p className="truncate font-medium">{product.name}</p>
                                {product.description && (
                                  <p className="truncate text-xs text-muted-foreground">{product.description}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{product.barcode || "Sin código"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(product.price)}</TableCell>
                          <TableCell className="tabular-nums">{product.stock_quantity}</TableCell>
                          <TableCell className="text-sm">{product.category || "Sin categoría"}</TableCell>
                          <TableCell className="text-sm">{product.section || "Sin sección"}</TableCell>
                          <TableCell>
                            <StatusPill tone="slate">Eliminado</StatusPill>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRestore(product.id)}
                              className="press gap-2 rounded-xl"
                            >
                              <RotateCcw className="h-4 w-4" />
                              Recuperar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {filteredDeletedProducts.length > PRODUCTS_PER_PAGE && (
              <Pager page={currentPageDeleted} totalPages={totalPagesDeleted} onChange={setCurrentPageDeleted} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[94vh] flex-col gap-0 overflow-hidden rounded-3xl border-0 p-0 sm:max-w-6xl"
        >
          <div className="bento-accent relative shrink-0 overflow-hidden rounded-none px-5 py-4 sm:px-6">
            <div className="pattern-rings pointer-events-none absolute inset-0" />
            <div className="relative flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
                {editingProduct ? <Edit className="h-5 w-5" /> : <PackagePlus className="h-5 w-5" />}
              </span>
              <DialogHeader className="min-w-0 flex-1 gap-1 text-left">
                <DialogTitle className="text-xl text-white">
                  {editingProduct ? "Editar producto" : "Nuevo producto"}
                </DialogTitle>
                <DialogDescription className="text-white/75">
                  {editingProduct
                    ? "Datos compartidos del producto y costo/precio/stock independiente por sucursal."
                    : "Escanea el código primero: si ya existe en otra sucursal se cargan sus datos."}
                </DialogDescription>
              </DialogHeader>
              <button
                type="button"
                onClick={() => setIsAddDialogOpen(false)}
                className="rounded-full p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative mt-3 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                <Store className="h-3.5 w-3.5" />
                {formEnabledRows.length}/{branchPricing.length} sucursales
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                <Boxes className="h-3.5 w-3.5" />
                {formTotalStock} pzas en total
              </span>
              {formPrices.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {Math.min(...formPrices) === Math.max(...formPrices)
                    ? formatMoney(formPrices[0])
                    : `${formatMoney(Math.min(...formPrices))} – ${formatMoney(Math.max(...formPrices))}`}
                </span>
              )}
              {formData.section && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1">
                  <Tag className="h-3.5 w-3.5" />
                  Sección {formData.section}
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              <section className="grid gap-5 md:grid-cols-[180px_minmax(0,1fr)]">
                <ImageUpload
                  key={formKey}
                  onImageUploaded={handleImageUploaded}
                  currentImage={formData.image_url}
                  className="space-y-2"
                />

                <div className="space-y-4">
                  <div className="rounded-2xl border border-primary/20 bg-primary/[0.03] p-3">
                    <Label
                      htmlFor="barcode"
                      className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary"
                    >
                      <ScanBarcode className="h-4 w-4" />
                      Código de barras
                    </Label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        ref={barcodeInputRef}
                        id="barcode"
                        autoFocus={!editingProduct}
                        className="h-11 flex-1 rounded-xl bg-background font-mono text-base"
                        value={formData.barcode}
                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                        placeholder="Escanea o ingresa manualmente"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && formData.barcode) {
                            e.preventDefault()
                            loadBranchVariants(formData.barcode.trim(), skuGroupId, { preserveLocalEdits: true })
                          }
                        }}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 flex-1 rounded-xl sm:flex-none"
                          onClick={() => {
                            if (formData.barcode.trim()) {
                              loadBranchVariants(formData.barcode.trim(), skuGroupId, { preserveLocalEdits: true })
                            }
                          }}
                        >
                          <Search className="mr-1.5 h-4 w-4" />
                          Buscar
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-xl"
                          title="Escanear código"
                          onClick={() => setIsQrScannerOpen(true)}
                        >
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 rounded-xl"
                          title="Generar código"
                          onClick={generateBarcode}
                        >
                          <Wand2 className="h-4 w-4 sm:mr-1.5" />
                          <span className="hidden sm:inline">Generar</span>
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Presiona <kbd className="rounded border bg-background px-1">Enter</kbd> para buscar el producto en
                      otras sucursales y cargar sus precios.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nombre del producto *</Label>
                    <Input
                      id="name"
                      required
                      className="h-11 rounded-xl text-base"
                      placeholder="Ej: Paracetamol 500 mg 20 tabletas"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="category">Categoría</Label>
                      <Input
                        id="category"
                        className="rounded-xl"
                        placeholder="Ej: Analgésicos"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="section">Sección (A1, A2, B1…)</Label>
                      <Input
                        id="section"
                        className="rounded-xl font-semibold uppercase"
                        value={formData.section}
                        onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                        placeholder="Ej: A1, B2, C3"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="days_before_expiry_alert">Alerta de caducidad (días)</Label>
                      <Input
                        id="days_before_expiry_alert"
                        type="number"
                        className="rounded-xl"
                        value={formData.days_before_expiry_alert}
                        onChange={(e) => setFormData({ ...formData, days_before_expiry_alert: e.target.value })}
                        placeholder="30"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      rows={2}
                      className="min-h-0 rounded-xl"
                      placeholder="Presentación, uso, notas…"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Store className="h-4 w-4 text-primary" />
                      Costo, precio y stock por sucursal
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      El costo actual no altera ventas pasadas. El markup por sucursal es opcional (vacío = markup
                      global).
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={enableAllBranches}
                      disabled={formEnabledRows.length === branchPricing.length}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Activar todas
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={copyFirstBranchToAll}
                      disabled={formEnabledRows.length < 2}
                      title="Copia costo, precio, markup, promo, mínimo y caducidad de la primera sucursal activa (el stock no se copia)"
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      Copiar precios a todas
                    </Button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm">
                  <Checkbox checked={applyMarkup} onCheckedChange={(checked) => setApplyMarkup(checked === true)} />
                  <Sparkles className="h-4 w-4 text-primary" />
                  Calcular precio de venta con markup (costo + % de aumento)
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  {branchPricing.map((row) => {
                    const rowPrice = Number.parseFloat(row.price) || 0
                    const rowCost = Number.parseFloat(row.cost_price) || 0
                    const rowProfit = rowPrice - rowCost
                    return (
                      <div
                        key={row.branch_id}
                        className={cn(
                          "rounded-2xl border p-3.5 transition-all",
                          row.enabled
                            ? "border-primary/25 bg-card shadow-[0_10px_28px_-18px_rgb(60_10_30/0.45)]"
                            : "border-dashed border-foreground/15 bg-muted/30",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            className="flex min-w-0 items-center gap-2.5 text-left"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => toggleBranchEnabled(row.branch_id)}
                          >
                            <span
                              className={cn(
                                "grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-colors",
                                row.enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                              )}
                            >
                              <Store className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{row.branch_name}</span>
                              <span className="block text-[11px] text-muted-foreground">
                                {row.enabled
                                  ? row.product_id
                                    ? "Ya existe en esta sucursal"
                                    : "Se dará de alta aquí"
                                  : "No se vende aquí · toca para activar"}
                              </span>
                            </span>
                          </button>
                          <Switch
                            checked={row.enabled}
                            onMouseDown={(e) => e.preventDefault()}
                            onCheckedChange={() => toggleBranchEnabled(row.branch_id)}
                            aria-label={`Activar ${row.branch_name}`}
                          />
                        </div>

                        {row.enabled && (
                          <div className="anim-rise-sm mt-3 space-y-2.5">
                            <div className="grid grid-cols-3 gap-2">
                              <MiniField label="Costo">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-9 rounded-lg"
                                  value={row.cost_price}
                                  onChange={(e) => updateBranchPricingRow(row.branch_id, { cost_price: e.target.value })}
                                  placeholder="0.00"
                                />
                              </MiniField>
                              <MiniField label="Precio *" strong>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-9 rounded-lg border-primary/30 font-semibold"
                                  value={row.price}
                                  onChange={(e) => updateBranchPricingRow(row.branch_id, { price: e.target.value })}
                                  placeholder="0.00"
                                />
                              </MiniField>
                              <MiniField label="Markup %">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-9 rounded-lg"
                                  value={row.markup_percent}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { markup_percent: e.target.value })
                                  }
                                  placeholder="Global"
                                />
                              </MiniField>
                              <MiniField label="Stock *" strong>
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-9 rounded-lg border-primary/30 font-semibold"
                                  value={row.stock_quantity}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { stock_quantity: e.target.value })
                                  }
                                  placeholder="0"
                                />
                              </MiniField>
                              <MiniField label="Mínimo">
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-9 rounded-lg"
                                  value={row.min_stock_level}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { min_stock_level: e.target.value })
                                  }
                                />
                              </MiniField>
                              <MiniField label="Promo">
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="h-9 rounded-lg"
                                  value={row.promotion_price}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { promotion_price: e.target.value })
                                  }
                                  placeholder="—"
                                />
                              </MiniField>
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                              <MiniField label="Caducidad">
                                <Input
                                  type="date"
                                  className="h-9 rounded-lg"
                                  value={row.expiration_date}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { expiration_date: e.target.value })
                                  }
                                />
                              </MiniField>
                              <div className="h-9 min-w-[120px] rounded-lg bg-muted/60 px-3 py-1 text-right">
                                <p className="text-[10px] leading-tight text-muted-foreground">Ganancia / pza</p>
                                <p
                                  className={cn(
                                    "text-xs font-bold tabular-nums leading-tight",
                                    rowProfit >= 0 ? "text-emerald-700" : "text-destructive",
                                  )}
                                >
                                  {rowPrice > 0 ? formatMoney(rowProfit) : "—"}
                                  {rowPrice > 0 && rowCost > 0 && ` · ${markupPercent(rowPrice, rowCost).toFixed(0)}%`}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>

            <div className="flex shrink-0 flex-col gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="hidden text-[11px] text-muted-foreground md:block">
                Los campos con * son obligatorios en cada sucursal activa.
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row-reverse">
                <Button
                  type="submit"
                  className="shine press rounded-xl"
                  disabled={savingProduct}
                  onClick={() => {
                    keepOpenRef.current = false
                  }}
                >
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {savingProduct ? "Guardando..." : editingProduct ? "Guardar cambios" : "Agregar producto"}
                </Button>
                {!editingProduct && (
                  <Button
                    type="submit"
                    variant="outline"
                    className="press rounded-xl"
                    disabled={savingProduct}
                    onClick={() => {
                      keepOpenRef.current = true
                    }}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    Guardar y agregar otro
                  </Button>
                )}
                <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isQrScannerOpen} onOpenChange={setIsQrScannerOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanBarcode className="h-5 w-5 text-primary" />
              Escanear código de barras
            </DialogTitle>
            <DialogDescription>Elige el método de escaneo que prefieras</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Segmented
              value={scannerMode}
              onChange={setScannerMode}
              full
              options={[
                { value: "manual", label: "Escáner físico", icon: Keyboard },
                { value: "camera", label: "Cámara", icon: Camera },
              ]}
            />

            {scannerMode === "manual" && (
              <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/[0.03] p-4">
                <p className="mb-2 text-sm text-muted-foreground">Usa tu escáner de códigos de barras físico:</p>
                <form onSubmit={handleManualScan}>
                  <Input
                    name="manualCode"
                    placeholder="Escanea el código aquí..."
                    autoFocus
                    className="h-12 rounded-xl bg-background text-center font-mono text-lg"
                  />
                </form>
              </div>
            )}

            {scannerMode === "camera" && (
              <div className="space-y-4">
                <div className="grid aspect-square place-items-center rounded-2xl bg-muted">
                  <div className="text-center">
                    <Camera className="mx-auto mb-2 h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Funcionalidad de cámara próximamente</p>
                  </div>
                </div>
                <form onSubmit={handleManualScan}>
                  <Input
                    name="manualCode"
                    placeholder="O ingresa el código manualmente"
                    className="h-11 rounded-xl font-mono"
                  />
                </form>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsQrScannerOpen(false)}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Exportar inventario
            </DialogTitle>
            <DialogDescription>Selecciona las secciones y opciones que deseas incluir en el reporte</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="font-semibold">Secciones a incluir</Label>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg text-xs" onClick={selectAllSections}>
                    Todas
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-lg text-xs"
                    onClick={deselectAllSections}
                  >
                    Ninguna
                  </Button>
                </div>
              </div>
              <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-2xl border bg-muted/30 p-2.5">
                {getUniqueSections().map((section) => {
                  const on = selectedSections.includes(section)
                  return (
                    <button
                      type="button"
                      key={section}
                      onClick={() => toggleSection(section)}
                      aria-pressed={on}
                      className={cn(
                        "press rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {section}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedSections.length} de {getUniqueSections().length} secciones seleccionadas
              </p>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Incluir en el reporte</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    { id: "include-stock-bajo", label: "Stock bajo", icon: AlertTriangle, checked: includeStockBajo, set: setIncludeStockBajo },
                    { id: "include-por-vencer", label: "Por vencer", icon: CalendarClock, checked: includePorVencer, set: setIncludePorVencer },
                    { id: "include-vencidos", label: "Vencidos", icon: CalendarX, checked: includeVencidos, set: setIncludeVencidos },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.id}
                    htmlFor={opt.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                      opt.checked ? "border-primary/40 bg-primary/[0.05]" : "bg-background",
                    )}
                  >
                    <Checkbox
                      id={opt.id}
                      checked={opt.checked}
                      onCheckedChange={(checked) => opt.set(checked as boolean)}
                    />
                    <opt.icon className="h-4 w-4 text-primary" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsExportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="shine press rounded-xl"
              onClick={generateStockReport}
              disabled={selectedSections.length === 0}
            >
              <Printer className="mr-2 h-4 w-4" />
              Imprimir reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5 text-emerald-700" />
              Agregar a pedido
            </DialogTitle>
            <DialogDescription>Elige sucursal, proveedor y cantidad</DialogDescription>
          </DialogHeader>

          {orderProduct && (
            <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
              {renderThumb(orderProduct, "h-12 w-12")}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{orderProduct.name}</p>
                <p className="text-xs text-muted-foreground">
                  Stock actual <b className="text-foreground">{orderProduct.stock_quantity}</b> · mín.{" "}
                  {orderProduct.min_stock_level}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sucursal</Label>
                <Select value={orderBranchId || undefined} onValueChange={setOrderBranchId}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Elegir sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Proveedor</Label>
                <Select value={orderSupplierId || undefined} onValueChange={setOrderSupplierId}>
                  <SelectTrigger className="w-full rounded-xl">
                    <SelectValue placeholder="Elegir proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Cantidad a pedir</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="press h-11 w-11 rounded-xl text-lg"
                  onClick={() => setOrderQty(String(Math.max(1, (Number.parseInt(orderQty) || 0) - 1)))}
                >
                  −
                </Button>
                <Input
                  type="number"
                  min={1}
                  className="h-11 flex-1 rounded-xl text-center text-lg font-semibold"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="press h-11 w-11 rounded-xl text-lg"
                  onClick={() => setOrderQty(String((Number.parseInt(orderQty) || 0) + 1))}
                >
                  +
                </Button>
              </div>
              <div className="flex gap-1.5">
                {[5, 10, 20, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setOrderQty(String(n))}
                    className={cn(
                      "press flex-1 rounded-lg border py-1 text-xs font-semibold transition-colors",
                      orderQty === String(n) ? "border-emerald-600 bg-emerald-600 text-white" : "hover:bg-muted",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <details className="group rounded-2xl border bg-muted/30">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <Plus className="h-4 w-4 text-emerald-700" />
                Crear proveedor nuevo
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t p-3">
                <Input
                  className="rounded-xl bg-background"
                  placeholder="Nombre del proveedor"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                />
                <Input
                  className="rounded-xl bg-background"
                  placeholder="Teléfono (opcional)"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl bg-background"
                  disabled={creatingSupplier || !newSupplierName.trim()}
                  onClick={createSupplierFromProducts}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {creatingSupplier ? "Creando..." : "Crear y seleccionar proveedor"}
                </Button>
              </div>
            </details>

            {orderDialogError ? <p className="text-sm text-destructive">{orderDialogError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setOrderDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={addProductToDraft}
              className="press rounded-xl bg-emerald-600 hover:bg-emerald-700"
              disabled={!orderBranchId || !orderSupplierId}
            >
              <PackagePlus className="mr-2 h-4 w-4" />
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hasOrderBar && (
        <div className="anim-rise-sm fixed inset-x-0 bottom-0 z-40 border-t border-emerald-200 bg-card/95 p-3 shadow-[0_-12px_40px_-16px_rgb(0_0_0/0.25)] backdrop-blur-md sm:p-4">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white">
                <Truck className="h-5 w-5" />
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold">
                  {orderDraft.length}
                </span>
              </span>
              <div className="min-w-0">
                <p className="font-bold">
                  Pedido listo · {orderDraft.length} producto{orderDraft.length === 1 ? "" : "s"} ·{" "}
                  {orderDraft.reduce((sum, item) => sum + item.quantity, 0)} pzas
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {selectedSupplierName || "Elige proveedor"} ·{" "}
                  {orderDraft.map((item) => `${item.product_name} (${item.quantity}) → ${item.branch_name}`).join(", ")}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setOrderDraft([])}>
                Vaciar
              </Button>
              <Button
                className="shine press flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 sm:flex-none"
                disabled={submittingOrder || !orderSupplierId}
                onClick={submitOrderDraft}
              >
                {submittingOrder ? "Enviando..." : "Enviar pedido"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const QUICK_FILTER_LABEL: Record<QuickFilter, string> = {
  all: "Todos",
  low: "Stock bajo",
  out: "Agotados",
  expiring: "Por vencer",
  expired: "Vencidos",
}

type Tone = "amber" | "rose" | "orange" | "red" | "emerald" | "slate"

const PILL_TONES: Record<Tone, string> = {
  amber: "bg-amber-100 text-amber-800 ring-amber-200",
  rose: "bg-rose-100 text-rose-700 ring-rose-200",
  orange: "bg-orange-100 text-orange-800 ring-orange-200",
  red: "bg-red-600 text-white ring-red-700",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
}

function StatusPill({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset",
        PILL_TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

const TILE_TONES: Record<"amber" | "rose" | "orange" | "red", { icon: string; ring: string; glow: string }> = {
  amber: { icon: "bg-amber-100 text-amber-700", ring: "ring-amber-400", glow: "from-amber-400/15" },
  rose: { icon: "bg-rose-100 text-rose-700", ring: "ring-rose-400", glow: "from-rose-400/15" },
  orange: { icon: "bg-orange-100 text-orange-700", ring: "ring-orange-400", glow: "from-orange-400/15" },
  red: { icon: "bg-red-100 text-red-700", ring: "ring-red-500", glow: "from-red-500/15" },
}

function FilterTile({
  icon: Icon,
  label,
  hint,
  value,
  tone,
  active,
  onClick,
  index,
}: {
  icon: LucideIcon
  label: string
  hint: string
  value: number
  tone: keyof typeof TILE_TONES
  active: boolean
  onClick: () => void
  index: number
}) {
  const t = TILE_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "bento bento-hover press anim-rise-sm group relative flex min-h-[9.5rem] flex-col justify-between overflow-hidden p-4 text-left",
        active && cn("ring-2 ring-offset-2 ring-offset-background", t.ring),
      )}
      style={stagger(index)}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100",
          t.glow,
          active && "opacity-100",
        )}
      />
      <div className="relative flex items-center justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", t.icon)}>
          <Icon className="h-5 w-5" />
        </span>
        {active ? (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
            Filtrando
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        )}
      </div>
      <div className="relative">
        <p className="text-3xl font-bold tabular-nums leading-none">
          <CountUp value={value} />
        </p>
        <p className="mt-1 text-sm font-semibold">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>
    </button>
  )
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  full,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon: LucideIcon }[]
  full?: boolean
}) {
  return (
    <div className={cn("inline-flex h-11 rounded-xl bg-muted/60 p-1", full && "flex w-full")}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all",
              full && "flex-1",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <opt.icon className="h-4 w-4" />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function MiniField({ label, strong, children }: { label: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className={cn("block text-[11px]", strong ? "font-semibold text-primary" : "text-muted-foreground")}>
        {label}
      </span>
      {children}
    </label>
  )
}

function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon
  title: string
  text: string
  action?: React.ReactNode
}) {
  return (
    <div className="bento anim-rise-sm flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="anim-pop grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary">
        <Icon className="h-7 w-7" />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      {action}
    </div>
  )
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const middle = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p > 1 && p < totalPages && Math.abs(p - page) <= 1,
  )
  const pageButton = (p: number) => (
    <button
      key={p}
      type="button"
      onClick={() => onChange(p)}
      className={cn(
        "press grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-semibold transition-colors",
        p === page ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted",
      )}
    >
      {p}
    </button>
  )
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bento flex items-center gap-1 p-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-xl"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Anterior</span>
        </Button>
        {pageButton(1)}
        {page > 3 && <span className="px-1 text-muted-foreground">…</span>}
        {middle.map(pageButton)}
        {page < totalPages - 2 && <span className="px-1 text-muted-foreground">…</span>}
        {totalPages > 1 && pageButton(totalPages)}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-xl"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          <span className="hidden sm:inline">Siguiente</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Página {page} de {totalPages}
      </p>
    </div>
  )
}
