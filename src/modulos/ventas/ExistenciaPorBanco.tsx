/** Dónde están las enjauladas de una raza (#13). Es ubicación, no
 *  "disponible por banco": lo que se puede vender se cuenta por raza. */
import { Badge } from '@/components/ui/badge'
import type { ExistenciaEnBanco } from '@/tipos/dominio'

export function ExistenciaPorBanco({
  bancos,
}: {
  bancos: readonly ExistenciaEnBanco[]
}) {
  if (bancos.length === 0)
    return <span className="text-texto-suave">Sin enjauladas</span>
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Reinas por banco">
      {bancos.map((b) => (
        <li key={b.banco_id ?? 'sin-banco'}>
          {/* banco_id null: enjauladas que todavía no pasaron a un banco. */}
          <Badge>
            {b.identificador ?? 'Sin banco'}
            <span className="font-mono tabular-nums text-texto">
              {b.reinas}
            </span>
          </Badge>
        </li>
      ))}
    </ul>
  )
}
