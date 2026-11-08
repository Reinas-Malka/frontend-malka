import { Hexagon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatearFecha } from '@/lib/fechas'
import { celdas, reinas, resumenDe } from '@/modulos/produccion/operaciones'
import {
  filasDeResultado,
  resumenDeIntroduccion,
} from '@/modulos/produccion/resultadoDeTanda'
import { ETAPA, etapasDe } from '@/modulos/produccion/tandas'
import type { NucleoDeTanda, TandaDetalle } from '@/tipos/dominio'

const TITULO = 'text-lg font-semibold text-texto'
const CELDA = 'px-3 py-1.5 text-right font-mono tabular-nums'

/** Núcleos con su fila, posición y cuántas celdas tienen. Sirve para lo que
 *  hay en el parque y para el reparto de una introducción. */
export function TablaDeNucleos({
  etiqueta,
  nucleos,
}: {
  etiqueta: string
  nucleos: readonly Pick<
    NucleoDeTanda,
    'nucleo_id' | 'fila' | 'posicion' | 'celdas'
  >[]
}) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-control border border-borde">
      <table className="w-full text-sm" aria-label={etiqueta}>
        <thead className="sticky top-0 bg-panel-alto text-xs text-texto-suave">
          <tr>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Fila
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Posición
            </th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">
              Celdas
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde text-texto">
          {nucleos.map((n) => (
            <tr key={n.nucleo_id}>
              <td className={CELDA}>{n.fila}</td>
              <td className={CELDA}>{n.posicion}</td>
              <td className={CELDA}>{n.celdas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Cuántas celdas hay en cada estado, en el orden del ciclo. */
export function CeldasDeLaTanda({ tanda }: { tanda: TandaDetalle }) {
  return (
    <section aria-labelledby="celdas-por-estado" className="space-y-3">
      <h2 id="celdas-por-estado" className={TITULO}>
        Celdas por estado{' '}
        <span className="text-base font-normal text-texto-suave tabular-nums">
          ({tanda.celdas} en total)
        </span>
      </h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {etapasDe(tanda).map(({ estado, cantidad }) => (
          <div
            key={estado}
            className="rounded-tarjeta border border-borde bg-panel p-3"
          >
            <dt>
              <Badge tono={ETAPA[estado].tono}>{ETAPA[estado].nombre}</Badge>
            </dt>
            <dd className="mt-1 font-mono text-2xl font-semibold text-texto tabular-nums">
              {cantidad}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Dónde están las celdas de la tanda: en qué núcleos de qué parque y en
 *  qué bancos. Se muestran grupos y cantidades, nunca celdas sueltas. */
export function UbicacionDeTanda({
  tanda,
  nombreDeParque,
}: {
  tanda: TandaDetalle
  nombreDeParque: (id: string) => string
}) {
  const r = resumenDe(tanda)
  // El backend los manda ordenados por parque, fila y posición.
  const porParque = new Map<string, NucleoDeTanda[]>()
  for (const n of tanda.nucleos)
    porParque.set(n.parque_id, [...(porParque.get(n.parque_id) ?? []), n])

  return (
    <div className="grid gap-seccion lg:grid-cols-2">
      <section aria-labelledby="en-el-parque" className="space-y-3">
        <h2 id="en-el-parque" className={TITULO}>
          En el parque
        </h2>
        {porParque.size === 0 ? (
          <p className="text-sm text-texto-suave">
            {r.cosechada
              ? 'Ya se cosechó: los núcleos quedaron libres.'
              : 'Todavía no se introdujo ninguna celda.'}
          </p>
        ) : (
          [...porParque].map(([parqueId, nucleos]) => {
            const total = nucleos.reduce((suma, n) => suma + n.celdas, 0)
            const nombre = nombreDeParque(parqueId)
            return (
              <div key={parqueId} className="space-y-2">
                <p className="text-sm text-texto">
                  <span className="font-medium">{nombre}</span>
                  <span className="text-texto-suave">
                    {' '}
                    · {celdas(total)} en {nucleos.length}{' '}
                    {nucleos.length === 1 ? 'núcleo' : 'núcleos'}
                  </span>
                </p>
                <TablaDeNucleos
                  etiqueta={`Núcleos ocupados en ${nombre}`}
                  nucleos={nucleos}
                />
              </div>
            )
          })
        )}
      </section>

      <section aria-labelledby="en-bancos" className="space-y-3">
        <h2 id="en-bancos" className={TITULO}>
          En bancos
        </h2>
        {tanda.bancos.length > 0 ? (
          <ul className="divide-y divide-borde rounded-control border border-borde text-sm">
            {tanda.bancos.map((b) => (
              <li
                key={b.banco_id}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="font-medium text-texto">
                  Banco {b.identificador}
                </span>
                <span className="font-mono text-texto tabular-nums">
                  {reinas(b.reinas)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {r.sinBanco > 0 ? (
          <p className="text-sm text-texto">
            {r.sinBanco === 1
              ? '1 reina cosechada todavía sin banco.'
              : `${r.sinBanco} reinas cosechadas todavía sin banco.`}
          </p>
        ) : null}
        {tanda.bancos.length === 0 && r.sinBanco === 0 ? (
          <p className="text-sm text-texto-suave">
            {r.cosechadas === 0
              ? 'Todavía no hay reinas cosechadas.'
              : 'Las reinas cosechadas ya no están en ningún banco.'}
          </p>
        ) : null}
      </section>
    </div>
  )
}

/** Dónde entró la tanda: un resumen que queda a la vista ("Introducida el
 *  12/10 en Parque Norte: 270 celdas en 135 núcleos (2 por núcleo)") y, si
 *  todavía hay celdas sin introducir, la acción para hacerlo. El parque se
 *  elige al introducir; los núcleos los reparte el sistema. */
export function DondeSeIntrodujo({
  tanda,
  nombreDeParque,
  alIntroducir,
}: {
  tanda: TandaDetalle
  nombreDeParque: (id: string) => string
  /** Solo si se puede introducir y quien mira tiene permiso. */
  alIntroducir?: () => void
}) {
  const resumen = resumenDeIntroduccion(tanda, nombreDeParque)
  const r = resumenDe(tanda)
  return (
    <section
      aria-labelledby="donde-se-introdujo"
      className="space-y-3 rounded-tarjeta border border-borde bg-panel p-4"
    >
      <h2 id="donde-se-introdujo" className={TITULO}>
        Introducción en el parque
      </h2>
      {resumen.length > 0 ? (
        <ul className="space-y-1 text-sm text-texto">
          {resumen.map((linea) => (
            <li key={linea.clave}>{linea.texto}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-texto-suave">
          {r.cosechada
            ? 'Ya se cosechó y los núcleos quedaron libres.'
            : 'Todavía no se introdujo en ningún parque.'}
        </p>
      )}
      {r.trasladadas > 0 && !r.cosechada ? (
        <div className="space-y-2">
          <p className="text-sm text-texto-suave">
            {`Quedan ${celdas(r.trasladadas)} sin introducir. `}
            Al introducir elegís el parque, la cantidad y la fecha: el sistema
            reparte las celdas parejo entre los núcleos activos de ese parque,
            primero los más libres.
          </p>
          {alIntroducir ? (
            <Button onClick={alIntroducir}>
              <Hexagon className="size-4" aria-hidden /> Elegir el parque e
              introducir
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/** Qué salió de la tanda: introducidas, cosechadas (y a dónde fueron) y
 *  descartadas, con y sin núcleo (backend #155). */
export function ResultadoDeLaTanda({ tanda }: { tanda: TandaDetalle }) {
  const filas = filasDeResultado(tanda, formatearFecha)
  return (
    <section aria-labelledby="resultado-de-la-tanda" className="space-y-3">
      <h2 id="resultado-de-la-tanda" className={TITULO}>
        Resultado de la tanda
      </h2>
      <dl
        aria-label="Resultado de la tanda"
        className="divide-y divide-borde rounded-control border border-borde text-sm"
      >
        {filas.map((f) => (
          <div
            key={f.clave}
            className="flex items-center justify-between gap-3 px-3 py-2"
          >
            <dt className="text-texto">{f.nombre}</dt>
            <dd className="font-mono text-texto tabular-nums">{f.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
