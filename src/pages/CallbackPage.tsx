import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { describirError, type ErrorParaMostrar } from '@/api/client'
import { CargaInicial } from '@/app/ErrorDeRuta'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { ErrorDePantalla } from '@/components/ui/estados'

/** /auth/callback: Cognito vuelve acá con ?code=…&state=…; se canjea por los
 *  tokens (PKCE) y se abre la pantalla de la que venía el usuario. */
export function CallbackPage() {
  const { completarIngreso } = useSesion()
  const navegar = useNavigate()
  const [error, setError] = useState<ErrorParaMostrar | null>(null)
  // El código es de un solo uso: StrictMode monta dos veces en desarrollo.
  const iniciado = useRef(false)

  useEffect(() => {
    if (iniciado.current) return
    iniciado.current = true
    completarIngreso()
      .then((volver) => navegar(volver, { replace: true }))
      .catch((e: unknown) => setError(describirError(e)))
  }, [completarIngreso, navegar])

  if (!error) return <CargaInicial />
  return (
    <main className="min-h-dvh space-y-4 bg-fondo p-6">
      <ErrorDePantalla
        error={{ ...error, codigo: error.codigo ?? 'ingreso_fallido' }}
      />
      <Button comoHijo variante="secundario">
        <Link to="/login" replace>
          Volver a ingresar
        </Link>
      </Button>
    </main>
  )
}
