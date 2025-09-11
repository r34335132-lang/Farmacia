import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function RegisterSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-primary">¡Registro Exitoso!</CardTitle>
            <CardDescription>Revisa tu correo para confirmar tu cuenta</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Te hemos enviado un correo de confirmación. Por favor, revisa tu bandeja de entrada y haz clic en el
              enlace para activar tu cuenta.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">Ir al Login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
