"use client"

import type React from "react"

import { useEffect, useState, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  ArrowLeft,
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  QrCode,
  Camera,
  Keyboard,
  RotateCcw,
  Archive,
  Printer,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ImageUpload } from "@/components/image-upload"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

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
}

interface BranchPricingRow {
  branch_id: string
  branch_name: string
  enabled: boolean
  product_id?: string
  price: string
  stock_quantity: string
  min_stock_level: string
  promotion_price: string
  expiration_date: string
}

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
  const router = useRouter()
  const supabase = createClient()

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    barcode: "",
    price: "",
    stock_quantity: "",
    min_stock_level: "10",
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
  }, [])

  useEffect(() => {
    if (branches.length > 0 || branchFilter === "all") {
      loadProducts()
    }
  }, [branchFilter, branches.length])

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
            stock_quantity: "0",
            min_stock_level: "10",
            promotion_price: "",
            expiration_date: "",
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
      stock_quantity: preset?.stock_quantity || "0",
      min_stock_level: preset?.min_stock_level || "10",
      promotion_price: preset?.promotion_price || "",
      expiration_date: preset?.expiration_date || "",
    }))
  }

  const loadBranchVariants = async (barcode?: string | null, groupId?: string | null) => {
    if (!barcode && !groupId) {
      setBranchPricing(buildDefaultBranchPricing())
      setSkuGroupId(null)
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
        setBranchPricing(buildDefaultBranchPricing())
        return
      }

      setBranchPricing(
        branches.map((branch) => {
          const variant = variants.find((v) => v.branch_id === branch.id)
          return {
            branch_id: branch.id,
            branch_name: branch.name,
            enabled: Boolean(variant),
            product_id: variant?.id,
            price: variant ? variant.price.toString() : "",
            stock_quantity: variant ? variant.stock_quantity.toString() : "0",
            min_stock_level: variant ? variant.min_stock_level.toString() : "10",
            promotion_price: variant?.promotion_price ? variant.promotion_price.toString() : "",
            expiration_date: variant?.expiration_date || "",
          }
        }),
      )
    } catch (error) {
      console.error("Error loading branch variants:", error)
      setBranchPricing(buildDefaultBranchPricing())
    }
  }

  const updateBranchPricingRow = (branchId: string, updates: Partial<BranchPricingRow>) => {
    setBranchPricing((rows) =>
      rows.map((row) => (row.branch_id === branchId ? { ...row, ...updates } : row)),
    )
  }

  const groupedByBarcode = useMemo(() => {
    if (branchFilter !== "all" || viewMode !== "grouped") return []
    const map = new Map<string, Product[]>()
    for (const product of filteredProducts) {
      const key = product.barcode?.trim() || product.sku_group_id || product.id
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(product)
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }))
  }, [filteredProducts, branchFilter, viewMode])

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
        },
        branches: branchPricing.map((row) => ({
          branch_id: row.branch_id,
          product_id: row.product_id || null,
          enabled: row.enabled,
          price: row.enabled ? Number.parseFloat(row.price) : 0,
          stock_quantity: row.enabled ? Number.parseInt(row.stock_quantity) : 0,
          min_stock_level: row.enabled ? Number.parseInt(row.min_stock_level || "10") : 10,
          promotion_price: row.promotion_price ? Number.parseFloat(row.promotion_price) : null,
          expiration_date: row.expiration_date || null,
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

      alert(editingProduct ? "Producto actualizado en todas las sucursales" : "Producto registrado correctamente")

      setFormData({
        name: "",
        description: "",
        barcode: "",
        price: "",
        stock_quantity: "",
        min_stock_level: "10",
        category: "",
        image_url: "",
        expiration_date: "",
        days_before_expiry_alert: "30",
        section: "",
        branch_id: branches[0]?.id || "",
      })
      setBranchPricing(buildDefaultBranchPricing())
      setSkuGroupId(null)
      setIsAddDialogOpen(false)
      setEditingProduct(null)
      loadProducts()
    } catch (error) {
      console.error("Unexpected error saving product:", error)
      alert("Error inesperado al guardar el producto")
    }
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
      return { status: "expiring", days: daysUntilExpiry, variant: "warning" as const }
    }
    return null
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

  const totalPagesActive = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  const startIndexActive = (currentPageActive - 1) * PRODUCTS_PER_PAGE
  const endIndexActive = startIndexActive + PRODUCTS_PER_PAGE
  const paginatedActiveProducts = filteredProducts.slice(startIndexActive, endIndexActive)

  const totalPagesDeleted = Math.ceil(filteredDeletedProducts.length / PRODUCTS_PER_PAGE)
  const startIndexDeleted = (currentPageDeleted - 1) * PRODUCTS_PER_PAGE
  const endIndexDeleted = startIndexDeleted + PRODUCTS_PER_PAGE
  const paginatedDeletedProducts = filteredDeletedProducts.slice(startIndexDeleted, endIndexDeleted)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando productos...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
            </Link>
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Gestión de Productos</h1>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        <div className="flex flex-col sm:flex-col gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-56">
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

          {branchFilter === "all" && (
            <Select value={viewMode} onValueChange={(v: "list" | "grouped") => setViewMode(v)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="list">Vista por fila</SelectItem>
                <SelectItem value="grouped">Agrupado por producto</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={openExportDialog}>
              <Printer className="h-4 w-4 mr-2" />
              Exportar Inventario
            </Button>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingProduct(null)
                    setSkuGroupId(null)
                    setFormData({
                      name: "",
                      description: "",
                      barcode: "",
                      price: "",
                      stock_quantity: "",
                      min_stock_level: "10",
                      category: "",
                      image_url: "",
                      expiration_date: "",
                      days_before_expiry_alert: "30",
                      section: "",
                      branch_id: branches[0]?.id || "",
                    })
                    setBranchPricing(buildDefaultBranchPricing())
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Editar Producto" : "Agregar Nuevo Producto"}</DialogTitle>
                  <DialogDescription>
                    Datos compartidos del producto y precio/stock independiente por sucursal
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <ImageUpload
                    onImageUploaded={handleImageUploaded}
                    currentImage={formData.image_url}
                    className="space-y-2"
                  />

                  <div className="space-y-2">
                    <Label htmlFor="name">Nombre del producto *</Label>
                    <Input
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="barcode">Código de barras</Label>
                    <div className="flex gap-2">
                      <Input
                        id="barcode"
                        value={formData.barcode}
                        onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                        onBlur={() => {
                          if (formData.barcode.trim()) {
                            loadBranchVariants(formData.barcode.trim(), skuGroupId)
                          }
                        }}
                        placeholder="Escanea o ingresa manualmente"
                        autoFocus={scannerMode === "manual"}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && formData.barcode) {
                            e.preventDefault()
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={() => setIsQrScannerOpen(true)}>
                        <QrCode className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" onClick={generateBarcode}>
                        Generar
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="category">Categoría</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="section">Sección (A1, A2, B1, etc.)</Label>
                      <Input
                        id="section"
                        value={formData.section}
                        onChange={(e) => setFormData({ ...formData, section: e.target.value.toUpperCase() })}
                        placeholder="Ej: A1, B2, C3"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="days_before_expiry_alert">Días de alerta de caducidad</Label>
                    <Input
                      id="days_before_expiry_alert"
                      type="number"
                      value={formData.days_before_expiry_alert}
                      onChange={(e) => setFormData({ ...formData, days_before_expiry_alert: e.target.value })}
                      placeholder="30"
                    />
                  </div>

                  <Card className="border-primary/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Precio y stock por sucursal</CardTitle>
                      <CardDescription>
                        Cada sucursal puede tener precio, promoción y stock diferentes.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">Activa</TableHead>
                            <TableHead>Sucursal</TableHead>
                            <TableHead>Precio *</TableHead>
                            <TableHead>Promo</TableHead>
                            <TableHead>Stock *</TableHead>
                            <TableHead>Mín.</TableHead>
                            <TableHead>Caducidad</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branchPricing.map((row) => (
                            <TableRow key={row.branch_id}>
                              <TableCell>
                                <Checkbox
                                  checked={row.enabled}
                                  onCheckedChange={(checked) =>
                                    updateBranchPricingRow(row.branch_id, { enabled: checked === true })
                                  }
                                />
                              </TableCell>
                              <TableCell className="font-medium whitespace-nowrap">{row.branch_name}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="w-24"
                                  disabled={!row.enabled}
                                  value={row.price}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { price: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="w-24"
                                  disabled={!row.enabled}
                                  value={row.promotion_price}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { promotion_price: e.target.value })
                                  }
                                  placeholder="—"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  className="w-20"
                                  disabled={!row.enabled}
                                  value={row.stock_quantity}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { stock_quantity: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min="0"
                                  className="w-16"
                                  disabled={!row.enabled}
                                  value={row.min_stock_level}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { min_stock_level: e.target.value })
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  className="w-36"
                                  disabled={!row.enabled}
                                  value={row.expiration_date}
                                  onChange={(e) =>
                                    updateBranchPricingRow(row.branch_id, { expiration_date: e.target.value })
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">{editingProduct ? "Actualizar" : "Agregar"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={isQrScannerOpen} onOpenChange={setIsQrScannerOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Escanear Código de Barras</DialogTitle>
                  <DialogDescription>Elige el método de escaneo que prefieras</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={scannerMode === "manual" ? "default" : "outline"}
                      onClick={() => setScannerMode("manual")}
                      className="flex-1"
                    >
                      <Keyboard className="h-4 w-4 mr-2" />
                      Escáner Físico
                    </Button>
                    <Button
                      type="button"
                      variant={scannerMode === "camera" ? "default" : "outline"}
                      onClick={() => setScannerMode("camera")}
                      className="flex-1"
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Cámara
                    </Button>
                  </div>

                  {scannerMode === "manual" && (
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <p className="text-sm text-muted-foreground mb-2">
                          Usa tu escáner de códigos de barras físico:
                        </p>
                        <form onSubmit={handleManualScan}>
                          <Input
                            name="manualCode"
                            placeholder="Escanea el código aquí..."
                            autoFocus
                            className="font-mono"
                          />
                        </form>
                      </div>
                    </div>
                  )}

                  {scannerMode === "camera" && (
                    <div className="space-y-4">
                      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <Camera className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Funcionalidad de cámara próximamente</p>
                        </div>
                      </div>
                      <form onSubmit={handleManualScan}>
                        <Input name="manualCode" placeholder="O ingresa el código manualmente" className="font-mono" />
                      </form>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsQrScannerOpen(false)}>
                    Cancelar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Exportar Inventario</DialogTitle>
              <DialogDescription>
                Selecciona las secciones y opciones que deseas incluir en el reporte
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-semibold">Secciones a incluir:</Label>
                <div className="flex gap-2 mb-2">
                  <Button type="button" variant="outline" size="sm" onClick={selectAllSections}>
                    Seleccionar todas
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={deselectAllSections}>
                    Deseleccionar todas
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {getUniqueSections().map((section) => (
                    <div key={section} className="flex items-center space-x-2">
                      <Checkbox
                        id={`section-${section}`}
                        checked={selectedSections.includes(section)}
                        onCheckedChange={() => toggleSection(section)}
                      />
                      <label htmlFor={`section-${section}`} className="text-sm font-medium leading-none cursor-pointer">
                        {section}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedSections.length} de {getUniqueSections().length} secciones seleccionadas
                </p>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Incluir en el reporte:</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-stock-bajo"
                      checked={includeStockBajo}
                      onCheckedChange={(checked) => setIncludeStockBajo(checked as boolean)}
                    />
                    <label htmlFor="include-stock-bajo" className="text-sm cursor-pointer">
                      Productos con stock bajo
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-por-vencer"
                      checked={includePorVencer}
                      onCheckedChange={(checked) => setIncludePorVencer(checked as boolean)}
                    />
                    <label htmlFor="include-por-vencer" className="text-sm cursor-pointer">
                      Productos por vencer
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="include-vencidos"
                      checked={includeVencidos}
                      onCheckedChange={(checked) => setIncludeVencidos(checked as boolean)}
                    />
                    <label htmlFor="include-vencidos" className="text-sm cursor-pointer">
                      Productos vencidos
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" onClick={generateStockReport} disabled={selectedSections.length === 0}>
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Reporte
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="active">
              <Package className="h-4 w-4 mr-2" />
              Productos Activos ({products.length})
            </TabsTrigger>
            <TabsTrigger value="deleted">
              <Archive className="h-4 w-4 mr-2" />
              Productos Eliminados ({deletedProducts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            <div className="mb-4 text-sm text-muted-foreground">
              Mostrando {startIndexActive + 1}-{Math.min(endIndexActive, filteredProducts.length)} de{" "}
              {filteredProducts.length} productos
              {searchTerm && ` (filtrados de ${products.length} totales)`}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Productos Activos ({products.length})</CardTitle>
                <CardDescription>Gestiona el inventario activo de la farmacia</CardDescription>
              </CardHeader>
              <CardContent>
                {viewMode === "grouped" && branchFilter === "all" ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Precios y stock por sucursal</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedByBarcode.map(({ key, items }) => (
                          <TableRow key={key}>
                            <TableCell className="font-medium">{items[0]?.name}</TableCell>
                            <TableCell className="font-mono text-sm">{items[0]?.barcode || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {items.map((p) => (
                                  <Badge key={p.id} variant="outline" className="text-xs">
                                    {getBranchName(p)}: ${p.price.toFixed(2)} · Stock {p.stock_quantity}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button variant="outline" size="sm" onClick={() => handleEdit(items[0])}>
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {groupedByBarcode.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">No hay productos para agrupar</div>
                    )}
                  </>
                ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Imagen</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Sucursal</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Sección</TableHead> 
                      <TableHead>Caducidad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedActiveProducts.map((product) => {
                      const expirationStatus = getExpirationStatus(product)

                      return (
                        <TableRow key={product.id}>
                          <TableCell>
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                              {product.image_url ? (
                                <img
                                  src={product.image_url || "/placeholder.svg"}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Package className="h-6 w-6 text-gray-400" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{product.name}</p>
                              {product.description && (
                                <p className="text-sm text-muted-foreground">{product.description}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{product.barcode || "Sin código"}</TableCell>
                          <TableCell>${product.price.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{product.stock_quantity}</span>
                              {product.stock_quantity <= product.min_stock_level && (
                                <Badge variant="destructive" className="text-xs">
                                  Bajo
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getBranchName(product)}</Badge>
                          </TableCell>
                          <TableCell>{product.category || "Sin categoría"}</TableCell>
                          <TableCell>{product.section || "Sin sección"}</TableCell> 
                          <TableCell>
                            {product.expiration_date ? (
                              <div className="flex flex-col gap-1">
                                <span className="text-sm">
                                  {new Date(product.expiration_date).toLocaleDateString("es-ES")}
                                </span>
                                {expirationStatus && (
                                  <Badge variant={expirationStatus.variant} className="text-xs w-fit">
                                    {expirationStatus.status === "expired"
                                      ? `Vencido hace ${expirationStatus.days}d`
                                      : `${expirationStatus.days}d restantes`}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Sin fecha</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">Activo</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleEdit(product)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(product.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                {filteredProducts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No se encontraron productos" : "No hay productos registrados"}
                  </div>
                )}

                {filteredProducts.length > PRODUCTS_PER_PAGE && (
                  <div className="flex flex-col items-center gap-4 mt-6">
                    <div className="flex justify-center items-center gap-2">
                      <Button
                        onClick={() => setCurrentPageActive((prev) => Math.max(1, prev - 1))}
                        disabled={currentPageActive === 1}
                        variant="outline"
                      >
                        Anterior
                      </Button>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => setCurrentPageActive(1)}
                          variant={currentPageActive === 1 ? "default" : "outline"}
                        >
                          1
                        </Button>

                        {currentPageActive > 3 && <span className="flex items-center px-2">...</span>}

                        {Array.from({ length: totalPagesActive }, (_, i) => i + 1)
                          .filter(
                            (page) => page > 1 && page < totalPagesActive && Math.abs(page - currentPageActive) <= 1,
                          )
                          .map((page) => (
                            <Button
                              key={page}
                              onClick={() => setCurrentPageActive(page)}
                              variant={currentPageActive === page ? "default" : "outline"}
                            >
                              {page}
                            </Button>
                          ))}

                        {currentPageActive < totalPagesActive - 2 && (
                          <span className="flex items-center px-2">...</span>
                        )}

                        {totalPagesActive > 1 && (
                          <Button
                            onClick={() => setCurrentPageActive(totalPagesActive)}
                            variant={currentPageActive === totalPagesActive ? "default" : "outline"}
                          >
                            {totalPagesActive}
                          </Button>
                        )}
                      </div>

                      <Button
                        onClick={() => setCurrentPageActive((prev) => Math.min(totalPagesActive, prev + 1))}
                        disabled={currentPageActive === totalPagesActive}
                        variant="outline"
                      >
                        Siguiente
                      </Button>
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      Página {currentPageActive} de {totalPagesActive}
                    </div>
                  </div>
                )}
                </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deleted" className="mt-6">
            <div className="mb-4 text-sm text-muted-foreground">
              Mostrando {startIndexDeleted + 1}-{Math.min(endIndexDeleted, filteredDeletedProducts.length)} de{" "}
              {filteredDeletedProducts.length} productos eliminados
              {searchTerm && ` (filtrados de ${deletedProducts.length} totales)`}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Productos Eliminados ({deletedProducts.length})</CardTitle>
                <CardDescription>
                  Productos que fueron eliminados pero se mantienen en el sistema por tener ventas registradas. Puedes
                  recuperarlos aquí.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Imagen</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Sección</TableHead> 
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedDeletedProducts.map((product) => (
                      <TableRow key={product.id} className="opacity-60">
                        <TableCell>
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                            {product.image_url ? (
                              <img
                                src={product.image_url || "/placeholder.svg"}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-gray-400" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{product.name}</p>
                            {product.description && (
                              <p className="text-sm text-muted-foreground">{product.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{product.barcode || "Sin código"}</TableCell>
                        <TableCell>${product.price.toFixed(2)}</TableCell>
                        <TableCell>{product.stock_quantity}</TableCell>
                        <TableCell>{product.category || "Sin categoría"}</TableCell>
                        <TableCell>{product.section || "Sin sección"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">Eliminado</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(product.id)}
                            className="gap-2"
                          >
                            <RotateCcw className="h-4 w-4" />
                            Recuperar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {filteredDeletedProducts.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No se encontraron productos eliminados" : "No hay productos eliminados"}
                  </div>
                )}

                {filteredDeletedProducts.length > PRODUCTS_PER_PAGE && (
                  <div className="flex flex-col items-center gap-4 mt-6">
                    <div className="flex justify-center items-center gap-2">
                      <Button
                        onClick={() => setCurrentPageDeleted((prev) => Math.max(1, prev - 1))}
                        disabled={currentPageDeleted === 1}
                        variant="outline"
                      >
                        Anterior
                      </Button>

                      <div className="flex gap-2">
                        <Button
                          onClick={() => setCurrentPageDeleted(1)}
                          variant={currentPageDeleted === 1 ? "default" : "outline"}
                        >
                          1
                        </Button>

                        {currentPageDeleted > 3 && <span className="flex items-center px-2">...</span>}

                        {Array.from({ length: totalPagesDeleted }, (_, i) => i + 1)
                          .filter(
                            (page) => page > 1 && page < totalPagesDeleted && Math.abs(page - currentPageDeleted) <= 1,
                          )
                          .map((page) => (
                            <Button
                              key={page}
                              onClick={() => setCurrentPageDeleted(page)}
                              variant={currentPageDeleted === page ? "default" : "outline"}
                            >
                              {page}
                            </Button>
                          ))}

                        {currentPageDeleted < totalPagesDeleted - 2 && (
                          <span className="flex items-center px-2">...</span>
                        )}

                        {totalPagesDeleted > 1 && (
                          <Button
                            onClick={() => setCurrentPageDeleted(totalPagesDeleted)}
                            variant={currentPageDeleted === totalPagesDeleted ? "default" : "outline"}
                          >
                            {totalPagesDeleted}
                          </Button>
                        )}
                      </div>

                      <Button
                        onClick={() => setCurrentPageDeleted((prev) => Math.min(totalPagesDeleted, prev + 1))}
                        disabled={currentPageDeleted === totalPagesDeleted}
                        variant="outline"
                      >
                        Siguiente
                      </Button>
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      Página {currentPageDeleted} de {totalPagesDeleted}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}