import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { NOMBRE_DE_ROL, puede, ROLES, type Rol } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  esAccionFinal,
  esPropuestaEjecutable,
  tituloDeAccion,
} from '@/lib/asistente'
import type { PropuestaEnChat } from '@/modulos/asistente/conversacion'

const esRol = (valor: string): valor is Rol => ROLES.includes(valor as Rol)

type Props = {
  item: PropuestaEnChat
  alConfirmar: (id: string) => void
  alDescartar: (id: string) => void
  /** Al seguir el enlace a lo creado (en el teléfono, cierra el panel). */
  alNavegar: () => void
  /** En un plan: el número de paso, sin Descartar propio (se descarta el
   *  plan entero) y, si todavía no se puede, por qué. */
  enPlan?: { bloqueo: string | null }
}

/** Una escritura propuesta por el asistente: qué es (resumen armado por el
 *  servidor) y Confirmar o Descartar. Confirmada o descartada, queda
 *  cerrada. Ocultar el botón por rol es comodidad: el permiso real lo
 *  aplica el endpoint al confirmar. */
export function TarjetaDePropuesta({
  item,
  alConfirmar,
  alDescartar,
  alNavegar,
  enPlan,
}: Props) {
  const { identidad } = useSesion()
  const { propuesta, estado } = item
  const roles = propuesta.roles_permitidos.filter(esRol)
  const tienePermiso = puede(identidad, roles)
  const ejecutable = esPropuestaEjecutable(propuesta)
  const titulo = tituloDeAccion(propuesta.accion)
  const idTitulo = `propuesta-${propuesta.id}`
  const idMotivo = `motivo-${propuesta.id}`
  const abierta = estado === 'pendiente' || estado === 'fallida'
  // Cancelar un pedido no tiene vuelta atrás: la tarjeta lo advierte.
  const final = esAccionFinal(propuesta.accion)
  const idAviso = `aviso-${propuesta.id}`
  const motivo = !ejecutable
    ? 'Esta propuesta no se puede confirmar desde acá.'
    : !tienePermiso
      ? `Tu rol no puede confirmarla: lo puede hacer ${roles.map((r) => NOMBRE_DE_ROL[r]).join(' o ') || 'otro rol'}.`
      : (enPlan?.bloqueo ?? null)

  return (
    <article
      aria-labelledby={idTitulo}
      className={
        final
          ? 'space-y-3 rounded-tarjeta border border-peligro/50 bg-peligro/5 p-3'
          : 'space-y-3 rounded-tarjeta border border-miel-600/40 bg-fondo p-3'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id={idTitulo}
          className="flex items-center gap-1.5 text-sm font-semibold text-texto"
        >
          {final ? (
            <TriangleAlert aria-hidden className="size-4 text-peligro-texto" />
          ) : null}
          {enPlan ? `Paso ${propuesta.paso}: ${titulo}` : titulo}
        </h3>
        {estado === 'confirmada' ? (
          <Badge tono="ok">Confirmada</Badge>
        ) : estado === 'descartada' ? (
          <Badge>Descartada</Badge>
        ) : (
          <Badge tono="miel">Sin guardar</Badge>
        )}
      </div>

      {propuesta.resumen.length > 0 ? (
        <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-sm">
          {propuesta.resumen.map(({ etiqueta, valor }, i) => (
            <div key={i} className="contents">
              <dt className="text-texto-suave">{etiqueta}</dt>
              <dd className="break-words text-texto">{valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {final && abierta ? (
        <p id={idAviso} className="text-sm font-medium text-peligro-texto">
          Atención: no se puede deshacer.
        </p>
      ) : null}

      {estado === 'confirmada' ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 text-sm text-ok-texto"
        >
          <CircleCheck aria-hidden className="size-4" />
          Listo, se guardó.
          {item.enlace ? (
            <Link
              to={item.enlace.a}
              onClick={alNavegar}
              className="inline-flex min-h-10 items-center font-medium text-miel-300 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-acento"
            >
              {item.enlace.texto}
            </Link>
          ) : null}
        </p>
      ) : null}

      {estado === 'descartada' ? (
        <p className="text-sm text-texto-suave">
          La descartaste: no se guardó nada.
        </p>
      ) : null}

      {estado === 'fallida' && item.error ? (
        <div
          role="alert"
          className="flex gap-2 rounded-control border border-peligro/40 bg-peligro/10 p-2 text-sm text-texto"
        >
          <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            No se guardó: {item.error.mensaje}
            {item.error.codigo ? (
              <span className="block text-xs text-texto-suave">
                Código: {item.error.codigo}
              </span>
            ) : null}
          </p>
        </div>
      ) : null}

      {abierta || estado === 'confirmando' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variante={final ? 'peligro' : 'primario'}
              cargando={estado === 'confirmando'}
              disabled={motivo !== null}
              aria-describedby={
                [motivo ? idMotivo : null, final ? idAviso : null]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              onClick={() => alConfirmar(propuesta.id)}
            >
              {estado === 'fallida'
                ? 'Reintentar'
                : enPlan
                  ? 'Confirmar este paso'
                  : 'Confirmar'}
            </Button>
            {enPlan ? null : (
              <Button
                variante="secundario"
                disabled={estado === 'confirmando'}
                onClick={() => alDescartar(propuesta.id)}
              >
                Descartar
              </Button>
            )}
          </div>
          {motivo ? (
            <p id={idMotivo} className="text-xs text-texto-suave">
              {motivo}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
