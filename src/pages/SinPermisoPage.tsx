import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Vacio } from '@/components/ui/estados'

/** Una sección que el rol del usuario no abre (#4). */
export function SinPermisoPage({ sinRol = false }: { sinRol?: boolean }) {
  if (sinRol) {
    return (
      <Vacio titulo="Tu usuario todavía no tiene un rol asignado.">
        Pedile a quien administra el criadero que te asigne uno. Mientras tanto,
        no hay secciones disponibles.
      </Vacio>
    )
  }
  return (
    <Vacio
      titulo="Esta sección no está disponible para tu rol."
      accion={
        <Button comoHijo variante="secundario">
          <Link to="/">Volver al inicio</Link>
        </Button>
      }
    >
      Si necesitás entrar, pedile a quien administra el criadero que revise tus
      permisos.
    </Vacio>
  )
}
