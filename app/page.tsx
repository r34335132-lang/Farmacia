"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ShoppingBag,
  Clock,
  MapPin,
  Phone,
  Heart,
  Shield,
  Truck,
  LogIn,
  ArrowRight,
  Sparkles,
  Users,
  Pill,
  Baby,
  Flower2,
  Apple,
  ChevronRight,
  Star,
  CheckCircle2,
} from "lucide-react"

const categories = [
  {
    name: "Medicamentos",
    description: "Medicamentos de venta libre y con receta",
    image: "/images/category-medicines.jpg",
    icon: Pill,
  },
  {
    name: "Vitaminas",
    description: "Suplementos y vitaminas para tu bienestar",
    image: "/images/category-vitamins.jpg",
    icon: Apple,
  },
  {
    name: "Belleza",
    description: "Cuidado de la piel y cosmeticos",
    image: "/images/category-beauty.jpg",
    icon: Flower2,
  },
  {
    name: "Bebe",
    description: "Todo para el cuidado de tu bebe",
    image: "/images/category-baby.jpg",
    icon: Baby,
  },
]

const features = [
  {
    icon: Shield,
    title: "Productos Certificados",
    description: "Todos nuestros medicamentos cuentan con registro sanitario",
  },
  {
    icon: Clock,
    title: "Recoge en Minutos",
    description: "Tu pedido listo para recoger en menos de 15 minutos",
  },
  {
    icon: Sparkles,
    title: "Ofertas Exclusivas",
    description: "Descuentos especiales solo en nuestra tienda en linea",
  },
  {
    icon: Heart,
    title: "Atencion Experta",
    description: "Farmaceuticos profesionales para asesorarte",
  },
]

const steps = [
  {
    number: "01",
    title: "Explora y Selecciona",
    description: "Navega por categorias o busca directamente los productos que necesitas",
  },
  {
    number: "02",
    title: "Agrega al Carrito",
    description: "Selecciona las cantidades y agrega todo lo que necesites",
  },
  {
    number: "03",
    title: "Confirma tu Pedido",
    description: "Ingresa tus datos y recibe un codigo unico de recogida",
  },
  {
    number: "04",
    title: "Recoge y Paga",
    description: "Presenta tu codigo en caja, verifica tu pedido y paga",
  },
]

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        setIsAuthenticated(true)
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single()
        setUserRole(profile?.role || null)
      }
    } catch {
      // Not authenticated
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/images/logo.jpeg"
                alt="Farmacia Bienestar"
                width={48}
                height={48}
                className="rounded-lg"
              />
              <div className="hidden sm:block">
                <h1 className="font-semibold text-lg leading-tight text-primary">Farmacia Bienestar</h1>
                <p className="text-xs text-muted-foreground">Tu salud, nuestra prioridad</p>
              </div>
            </Link>

            <nav className="flex items-center gap-2">
              <Link href="/tienda">
                <Button variant="ghost" className="hidden sm:flex">
                  Tienda
                </Button>
              </Link>
              {isAuthenticated ? (
                <Link href={userRole === "admin" ? "/admin/dashboard" : userRole === "cajero" ? "/cajero" : "/pos"}>
                  <Button>
                    <Users className="h-4 w-4 mr-2" />
                    Panel
                  </Button>
                </Link>
              ) : (
                <Link href="/auth/login">
                  <Button variant="outline" className="bg-transparent">
                    <LogIn className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Empleados</span>
                  </Button>
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/images/hero-pharmacy.jpg"
            alt="Farmacia moderna"
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/70" />
        </div>
        
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              Compra en linea, recoge en tienda
            </div>
            
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight text-balance">
              Tu bienestar comienza{" "}
              <span className="text-primary">aqui</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed text-pretty max-w-xl">
              Encuentra medicamentos, vitaminas y productos de cuidado personal. 
              Ordena en linea y recoge en minutos.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/tienda">
                <Button size="lg" className="w-full sm:w-auto text-base px-8 h-12">
                  <ShoppingBag className="h-5 w-5 mr-2" />
                  Explorar Tienda
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </Link>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center gap-6 mt-10 pt-10 border-t border-border/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">Productos certificados</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">Recogida rapida</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="text-sm text-muted-foreground">Pago en tienda</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-16 md:py-24 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Explora por Categoria
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Encuentra facilmente lo que necesitas navegando por nuestras categorias
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {categories.map((category) => (
              <Link 
                key={category.name} 
                href={`/tienda?category=${encodeURIComponent(category.name)}`}
              >
                <Card className="group overflow-hidden border-0 shadow-sm hover:shadow-lg transition-all duration-300 h-full">
                  <div className="aspect-[4/3] relative overflow-hidden">
                    <Image
                      src={category.image || "/placeholder.svg"}
                      alt={category.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                    <div className="absolute top-3 left-3 p-2 rounded-lg bg-primary/90 text-primary-foreground backdrop-blur-sm">
                      <category.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-1 group-hover:text-primary transition-colors">
                      {category.name}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {category.description}
                    </p>
                    <div className="flex items-center gap-1 mt-3 text-primary text-sm font-medium">
                      Ver productos
                      <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Por que elegirnos
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Nos comprometemos a brindarte la mejor experiencia de compra
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={feature.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-16 md:py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Como funciona
            </h2>
            <p className="text-primary-foreground/80 max-w-2xl mx-auto">
              Ordenar es muy sencillo. Sigue estos simples pasos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={step.number} className="relative">
                <div className="text-6xl font-bold text-primary-foreground/10 mb-4">
                  {step.number}
                </div>
                <h3 className="font-semibold text-xl mb-2">{step.title}</h3>
                <p className="text-primary-foreground/70 text-sm leading-relaxed">
                  {step.description}
                </p>
                {index < steps.length - 1 && (
                  <ChevronRight className="hidden lg:block absolute top-8 -right-4 h-8 w-8 text-primary-foreground/20" />
                )}
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/tienda">
              <Button size="lg" variant="secondary" className="text-primary">
                Comenzar a Comprar
                <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <Card className="border-0 shadow-lg overflow-hidden">
            <div className="grid md:grid-cols-2 gap-0">
              <div className="relative h-64 md:h-auto">
                <Image
                  src="/images/category-personal.jpg"
                  alt="Productos de farmacia"
                  fill
                  className="object-cover"
                />
              </div>
              <CardContent className="p-8 md:p-12 flex flex-col justify-center">
                <h2 className="text-2xl md:text-3xl font-bold mb-4">
                  Listo para ordenar?
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Descubre todas las ofertas y productos disponibles en nuestra tienda. 
                  Tu pedido estara listo para recoger en minutos.
                </p>
                <div>
                  <Link href="/tienda">
                    <Button size="lg">
                      <ShoppingBag className="h-5 w-5 mr-2" />
                      Visitar Tienda
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </div>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-muted/50 border-t py-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/images/logo.jpeg"
                  alt="Farmacia Bienestar"
                  width={48}
                  height={48}
                  className="rounded-lg"
                />
                <div>
                  <h3 className="font-semibold text-lg text-primary">Farmacia Bienestar</h3>
                  <p className="text-xs text-muted-foreground">Tu salud, nuestra prioridad</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Ofrecemos productos farmaceuticos de calidad con atencion personalizada 
                para cuidar de ti y tu familia. Compra en linea y recoge en tienda.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Horario
              </h4>
              <p className="text-sm text-muted-foreground mb-1">Lunes - Sabado</p>
              <p className="text-sm font-medium mb-3">8:00 AM - 9:00 PM</p>
              <p className="text-sm text-muted-foreground mb-1">Domingo</p>
              <p className="text-sm font-medium">9:00 AM - 3:00 PM</p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Ubicacion
              </h4>
              <p className="text-sm text-muted-foreground mb-1">Calle Principal #123</p>
              <p className="text-sm text-muted-foreground mb-4">Colonia Centro</p>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">(123) 456-7890</span>
              </div>
            </div>
          </div>
          
          <div className="border-t pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              2026 Farmacia Bienestar. Todos los derechos reservados.
            </p>
            <div className="flex items-center gap-6">
              <Link href="/tienda" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Tienda
              </Link>
              <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Empleados
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
