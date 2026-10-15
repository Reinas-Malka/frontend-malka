import { Hexagon, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { destinoSeguro, useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ErrorDePantalla } from '@/components/ui/estados'

/** Pantalla pública de ingreso. La contraseña se escribe en el hosted UI de
 *  Cognito, nunca en esta app. */
export function LoginPage() {
  const { identidad, estado, error, ingresar } = useSesion()
  const [parametros] = useSearchParams()
  const volver = destinoSeguro(parametros.get('volver'))
  const [redirigiendo, setRedirigiendo] = useState(false)

  if (identidad) return <Navigate to={volver} replace />

  return (
    <main className="grid min-h-dvh place-items-center bg-fondo px-4">
      <Card className="w-full max-w-sm space-y-5 p-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-2 font-semibold text-texto">
            <Hexagon
              aria-hidden
              className="size-5 fill-miel-500/20 text-miel-400"
            />
            Malka Suite
          </span>
          <h1 className="text-xl font-semibold text-texto">
            Ingresá a tu criadero
          </h1>
          <p className="text-sm text-texto-suave">
            Te llevamos a la pantalla segura de ingreso y volvés acá con tu
            sesión.
          </p>
        </div>
        {estado === 'error' ? (
          <ErrorDePantalla
            error={{
              codigo: 'sin_configuracion',
              mensaje: error ?? 'No se pudo configurar el login.',
            }}
          />
        ) : (
          <Button
            className="w-full"
            cargando={redirigiendo || estado === 'cargando'}
            onClick={() => {
              setRedirigiendo(true)
              void ingresar(volver).catch(() => setRedirigiendo(false))
            }}
          >
            <LogIn aria-hidden className="size-4" /> Ingresar
          </Button>
        )}
      </Card>
    </main>
  )
}
