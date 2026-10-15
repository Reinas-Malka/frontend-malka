import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Vacio } from '@/components/ui/estados'

export function NoEncontradaPage() {
  return (
    <Vacio
      titulo="Esta página no existe."
      accion={
        <Button comoHijo variante="secundario">
          <Link to="/">Volver al inicio</Link>
        </Button>
      }
    >
      Revisá la dirección o elegí una opción del menú.
    </Vacio>
  )
}
