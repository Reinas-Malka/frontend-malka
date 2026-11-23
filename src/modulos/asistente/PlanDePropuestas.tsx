import { ListOrdered } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MensajeDelAsistente } from '@/modulos/asistente/conversacion'
import {
  bloqueoDelPaso,
  estadoDelPlan,
  pasosDelPlan,
  planAbierto,
} from '@/modulos/asistente/plan'
import { TarjetaDePropuesta } from '@/modulos/asistente/TarjetaDePropuesta'

type Props = {
  mensaje: MensajeDelAsistente
  alConfirmar: (id: string) => void
  alConfirmarTodo: (idDeUnPaso: string) => void
  alDescartar: (id: string) => void
  alNavegar: () => void
}

/** Varias propuestas de una respuesta: un plan que se ejecuta en orden. Se
 *  confirma entero (se frena en el primer error) o paso a paso; descartar
 *  descarta lo que falta. */
export function PlanDePropuestas({
  mensaje,
  alConfirmar,
  alConfirmarTodo,
  alDescartar,
  alNavegar,
}: Props) {
  const pasos = pasosDelPlan(mensaje.propuestas)
  const primero = pasos[0].propuesta.id
  const idTitulo = `plan-${mensaje.id}`
  const abierto = planAbierto(pasos)
  const corriendo = pasos.some((p) => p.estado === 'confirmando')
  const fallido = pasos.find((p) => p.estado === 'fallida')
  const estado = estadoDelPlan(pasos)

  return (
    <section
      aria-labelledby={idTitulo}
      className="space-y-3 rounded-tarjeta border border-borde bg-panel-alto/40 p-3"
    >
      <h3
        id={idTitulo}
        className="flex items-center gap-1.5 text-sm font-semibold text-texto"
      >
        <ListOrdered aria-hidden className="size-4 text-miel-400" />
        Plan de {pasos.length} pasos
      </h3>
      <ol className="space-y-2">
        {pasos.map((item) => (
          <li key={item.propuesta.id}>
            <TarjetaDePropuesta
              item={item}
              alConfirmar={alConfirmar}
              alDescartar={alDescartar}
              alNavegar={alNavegar}
              enPlan={{ bloqueo: bloqueoDelPaso(pasos, item.propuesta.id) }}
            />
          </li>
        ))}
      </ol>
      {estado ? (
        <p role={fallido ? 'alert' : 'status'} className="text-sm text-texto">
          {estado}
        </p>
      ) : null}
      {abierto ? (
        <div className="flex flex-wrap gap-2">
          <Button cargando={corriendo} onClick={() => alConfirmarTodo(primero)}>
            {fallido ? 'Reintentar desde acá' : 'Confirmar todo'}
          </Button>
          <Button
            variante="secundario"
            disabled={corriendo}
            onClick={() => alDescartar(primero)}
          >
            Descartar
          </Button>
        </div>
      ) : null}
    </section>
  )
}
