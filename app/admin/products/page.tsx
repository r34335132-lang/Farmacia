"use client"

import type React from "react"

import { useEffect, useState } from "react"
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
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ImageUpload } from "@/components/image-upload"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  })

  useEffect(() => {
    checkAuth()
    loadProducts()
  }, [])

  useEffect(() => {
    const filtered = products.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    setFilteredProducts(filtered)

    const filteredDeleted = deletedProducts.filter(
      (product) =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()),
    )
    setFilteredDeletedProducts(filteredDeleted)
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
      const { data, error, count } = await supabase
        .from("products")
        .select("*", { count: "exact" })
        .order("name", { ascending: true })

      if (error) throw error

      const allProducts = data || []
      const activeProds = allProducts.filter((p) => p.is_active !== false)
      const inactiveProds = allProducts.filter((p) => p.is_active === false)

      console.log(
        "[v0] TODOS los productos cargados:",
        allProducts.length,
        "Activos:",
        activeProds.length,
        "Eliminados:",
        inactiveProds.length,
      )

      setProducts(activeProds)
      setDeletedProducts(inactiveProds)
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadDeletedProducts = async () => {
    // Mantenerla vacía o removerla completamente
  }

  const handleRestore = async (productId: string) => {
    if (!confirm("¿Estás seguro de que quieres recuperar este producto?")) return

    try {
      const { error } = await supabase.from("products").update({ is_active: true }).eq("id", productId)

      if (error) throw error

      // Reload both lists
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

    if (!formData.price || Number.parseFloat(formData.price) <= 0) {
      alert("El precio debe ser mayor a 0")
      return
    }

    if (!formData.stock_quantity || Number.parseInt(formData.stock_quantity) < 0) {
      alert("El stock debe ser 0 o mayor")
      return
    }

    try {
      const productData = {
        name: formData.name,
        description: formData.description,
        barcode: formData.barcode || null,
        price: Number.parseFloat(formData.price),
        stock_quantity: Number.parseInt(formData.stock_quantity),
        min_stock_level: Number.parseInt(formData.min_stock_level),
        category: formData.category,
        image_url: formData.image_url || null,
        expiration_date: formData.expiration_date || null,
        days_before_expiry_alert: formData.days_before_expiry_alert
          ? Number.parseInt(formData.days_before_expiry_alert)
          : 30,
      }

      if (editingProduct) {
        // Update existing product
        const { error } = await supabase.from("products").update(productData).eq("id", editingProduct.id)

        if (error) {
          console.error("Error updating product:", error)
          alert(`Error al actualizar: ${error.message}`)
          return
        }
        alert("Producto actualizado exitosamente")
      } else {
        // Create new product without barcode uniqueness validation
        const { error } = await supabase.from("products").insert([productData])

        if (error) {
          console.error("Error creating product:", error)
          if (error.message.includes("duplicate")) {
            alert(
              "Este código de barras ya existe. Puedes usar el mismo código para un producto diferente si lo deseas.",
            )
          } else {
            alert(`Error al guardar: ${error.message}`)
          }
          return
        }
        alert("Producto registrado exitosamente")
      }

      // Reset form and close dialog
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
      })
      setIsAddDialogOpen(false)
      setEditingProduct(null)
      loadProducts()
    } catch (error) {
      console.error("Unexpected error saving product:", error)
      alert("Error inesperado al guardar el producto")
    }
  }

  const handleEdit = (product: Product) => {
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
    })
    setEditingProduct(product)
    setIsAddDialogOpen(true)
  }

  const handleDelete = async (productId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este producto?")) return

    try {
      const { error } = await supabase.from("products").update({ is_active: false }).eq("id", productId)

      if (error) throw error
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

  const generateStockReport = () => {
    const reportContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reporte de Inventario</title>
          <style>
            @page {
              size: 55mm auto;
              margin: 0;
            }
            
            body {
              font-family: 'Courier New', monospace;
              font-size: 10px;
              line-height: 1.2;
              margin: 0;
              padding: 2mm;
              width: 55mm;
              max-width: 55mm;
              box-sizing: border-box;
              background: white;
            }
            
            .header {
              text-align: center;
              margin-bottom: 3mm;
              border-bottom: 1px dashed #000;
              padding-bottom: 2mm;
            }
            
            .title {
              font-size: 12px;
              font-weight: bold;
              margin-bottom: 1mm;
            }
            
            .date {
              font-size: 9px;
              margin-bottom: 1mm;
            }
            
            .section {
              margin: 3mm 0;
            }
            
            .section-title {
              font-size: 10px;
              font-weight: bold;
              text-align: center;
              margin: 2mm 0;
              padding: 1mm 0;
              border-top: 1px dashed #000;
              border-bottom: 1px dashed #000;
            }
            
            .product-line {
              display: flex;
              justify-content: space-between;
              margin: 1mm 0;
              font-size: 9px;
            }
            
            .product-name {
              flex: 1;
              margin-right: 2mm;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            
            .product-stock {
              text-align: right;
              min-width: 8mm;
              font-weight: bold;
            }
            
            .low-stock {
              color: #ff0000;
            }
            
            .expiring {
              color: #ff6600;
            }
            
            .expired {
              color: #cc0000;
              text-decoration: line-through;
            }
            
            .footer {
              margin-top: 3mm;
              padding-top: 2mm;
              border-top: 1px dashed #000;
              text-align: center;
              font-size: 8px;
            }
            
            .total-line {
              font-weight: bold;
              font-size: 10px;
              text-align: center;
              margin: 2mm 0;
              padding: 1mm 0;
              border-top: 1px solid #000;
            }
            
            @media print {
              body { 
                width: 55mm;
                max-width: 55mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">REPORTE DE INVENTARIO</div>
            <div class="date">FECHA: ${new Date().toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</div>
          </div>
          
          <div class="section">
            <div class="section-title">== PRODUCTOS EN STOCK ==</div>
            ${products
              .map((product) => {
                const expirationStatus = getExpirationStatus(product)
                const statusClass =
                  expirationStatus?.status === "expired"
                    ? "expired"
                    : expirationStatus?.status === "expiring"
                      ? "expiring"
                      : ""
                return `
              <div class="product-line">
                <div class="product-name ${statusClass}">${product.name}${expirationStatus ? ` (${expirationStatus.status === "expired" ? "VENCIDO" : `Vence en ${expirationStatus.days}d`})` : ""}</div>
                <div class="product-stock ${product.stock_quantity <= product.min_stock_level ? "low-stock" : ""}">${product.stock_quantity}</div>
              </div>
            `
              })
              .join("")}
          </div>
          
          <div class="total-line">
            TOTAL PRODUCTOS: ${products.length}
          </div>
          
          <div class="section">
            <div class="section-title">== PRODUCTOS CON STOCK BAJO ==</div>
            ${
              products
                .filter((p) => p.stock_quantity <= p.min_stock_level)
                .map(
                  (product) => `
              <div class="product-line">
                <div class="product-name">${product.name}</div>
                <div class="product-stock low-stock">${product.stock_quantity}</div>
              </div>
            `,
                )
                .join("") || '<div style="text-align: center; font-style: italic;">Ningún producto con stock bajo</div>'
            }
          </div>
          
          <div class="section">
            <div class="section-title">== PRODUCTOS POR VENCER ==</div>
            ${
              products
                .filter((p) => {
                  const status = getExpirationStatus(p)
                  return status && status.status === "expiring"
                })
                .map((product) => {
                  const status = getExpirationStatus(product)
                  return `
              <div class="product-line">
                <div class="product-name expiring">${product.name}</div>
                <div class="product-stock">${status?.days}d</div>
              </div>
            `
                })
                .join("") || '<div style="text-align: center; font-style: italic;">Ningún producto por vencer</div>'
            }
          </div>
          
          <div class="section">
            <div class="section-title">== PRODUCTOS VENCIDOS ==</div>
            ${
              products
                .filter((p) => {
                  const status = getExpirationStatus(p)
                  return status && status.status === "expired"
                })
                .map(
                  (product) => `
              <div class="product-line">
                <div class="product-name expired">${product.name}</div>
                <div class="product-stock">VENCIDO</div>
              </div>
            `,
                )
                .join("") || '<div style="text-align: center; font-style: italic;">Ningún producto vencido</div>'
            }
          </div>
          
          <div class="footer">
            <div>Total de productos: ${products.length}</div>
            <div>Stock bajo: ${products.filter((p) => p.stock_quantity <= p.min_stock_level).length}</div>
            <div>Por vencer: ${
              products.filter((p) => {
                const s = getExpirationStatus(p)
                return s && s.status === "expiring"
              }).length
            }</div>
            <div>Vencidos: ${
              products.filter((p) => {
                const s = getExpirationStatus(p)
                return s && s.status === "expired"
              }).length
            }</div>
            <div>Generado: ${new Date().toLocaleString("es-ES")}</div>
          </div>
        </body>
      </html>
    `

    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(reportContent)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 250)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Cargando productos...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
        {/* Search and Add */}
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

          <div className="flex gap-2">
            <Button variant="outline" onClick={generateStockReport}>
              <Package className="h-4 w-4 mr-2" />
              Exportar Inventario
            </Button>

            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  onClick={() => {
                    setEditingProduct(null)
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
                    })
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Editar Producto" : "Agregar Nuevo Producto"}</DialogTitle>
                  <DialogDescription>
                    {editingProduct ? "Modifica los datos del producto" : "Completa la información del nuevo producto"}
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
                      <Label htmlFor="price">Precio *</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        required
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">Categoría</Label>
                      <Input
                        id="category"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="stock_quantity">Stock actual *</Label>
                      <Input
                        id="stock_quantity"
                        type="number"
                        required
                        value={formData.stock_quantity}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="min_stock_level">Stock mínimo</Label>
                      <Input
                        id="min_stock_level"
                        type="number"
                        value={formData.min_stock_level}
                        onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiration_date">Fecha de caducidad</Label>
                      <Input
                        id="expiration_date"
                        type="date"
                        value={formData.expiration_date}
                        onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="days_before_expiry_alert">Días de alerta</Label>
                      <Input
                        id="days_before_expiry_alert"
                        type="number"
                        value={formData.days_before_expiry_alert}
                        onChange={(e) => setFormData({ ...formData, days_before_expiry_alert: e.target.value })}
                        placeholder="30"
                      />
                      <p className="text-xs text-muted-foreground">Días antes de vencer para alertar</p>
                    </div>
                  </div>

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
            <Card>
              <CardHeader>
                <CardTitle>Productos Activos ({products.length})</CardTitle>
                <CardDescription>Gestiona el inventario activo de la farmacia</CardDescription>
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
                      <TableHead>Caducidad</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
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
                          <TableCell>{product.category || "Sin categoría"}</TableCell>
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deleted" className="mt-6">
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
                      <TableHead>Estado</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDeletedProducts.map((product) => (
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
