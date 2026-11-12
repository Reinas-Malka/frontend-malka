import { Calculator, Check, Copy, Info } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DataTable, type Columna } from '@/components/ui/table'
import { formatearImporte } from '@/lib/importes'
import { copiarTexto } from '@/lib/portapapeles'
import {
  bloquesDelCuerpo,
  detalleDelPedido,
  type FilaDelDetalle,
  type PedidoDelDocumento,
  textoParaCopiar,
  TITULO_DEL_DETALLE,
} from '@/modulos/ventas/borradores'
import type { ContenidoDeBorrador } from '@/tipos/dominio'

const columnas = (moneda: string): Columna<FilaDelDetalle>[] => [
  {
    clave: 'item',
    titulo: 'Producto',
    render: (l) => <span className="font-medium text-texto">{l.item}</span>,
  },
  {
    clave: 'cantidad',
    titulo: 'Cantidad',
    className: 'text-right font-mono tabular-nums',
  },
  { clave: 'raza', titulo: 'Raza' },
  {
    clave: 'precio_unitario',
    titulo: `Precio unitario (${moneda})`,
    className: 'text-right font-mono tabular-nums',
    render: (l) => formatearImporte(l.precio_unitario),
  },
  {
    clave: 'neto',
    titulo: 'Neto',
    className: 'text-right font-mono tabular-nums',
    render: (l) => formatearImporte(l.neto),
  },
]

type Copiado = 'nada' | 'copiado' | 'fallo'

/** El documento completo: el texto de la IA (encabezado, cuerpo en
 *  párrafos y notas) y el detalle del pedido tal como lo calcula el
 *  sistema. Se puede copiar entero para pegarlo en otro lado. */
export function DocumentoDelBorrador({
  contenido,
  origen,
}: {
  contenido: ContenidoDeBorrador
  origen: PedidoDelDocumento
}) {
  const ids = useId()
  const [copiado, setCopiado] = useState<Copiado>('nada')
  const detalle = detalleDelPedido(origen)
  const { moneda } = detalle
  const importes = [
    { nombre: 'Neto', valor: detalle.neto },
    { nombre: 'IVA', valor: detalle.iva },
    { nombre: 'Total', valor: detalle.total },
  ]
  const copiar = async () =>
    setCopiado(
      (await copiarTexto(textoParaCopiar(contenido, detalle)))
        ? 'copiado'
        : 'fallo',
    )

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 text-sm text-texto-suave">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          El texto lo redacta la IA. Las cantidades y los importes salen del
          pedido: los calcula el sistema, no la IA.
        </span>
      </p>

      <article
        aria-label="Texto del borrador"
        className="space-y-3 rounded-control border border-borde bg-fondo p-4"
      >
        <h3 className="text-tarjeta-titulo font-semibold text-texto">
          {contenido.encabezado}
        </h3>
        {bloquesDelCuerpo(contenido.cuerpo).map((bloque, n) =>
          bloque.tipo === 'titulo' ? (
            <h4
              key={n}
              className="pt-1 text-xs font-semibold uppercase tracking-wide text-texto-suave"
            >
              {bloque.texto}
            </h4>
          ) : (
            <p key={n} className="whitespace-pre-line text-sm text-texto">
              {bloque.texto}
            </p>
          ),
        )}
      </article>

      <section aria-labelledby={`${ids}-detalle`} className="space-y-2">
        <h4
          id={`${ids}-detalle`}
          className="flex items-center gap-2 text-sm font-semibold text-texto"
        >
          <Calculator className="size-4 text-texto-suave" aria-hidden />
          {TITULO_DEL_DETALLE}
        </h4>
        <DataTable
          columnas={columnas(moneda)}
          filas={detalle.lineas}
          porPagina={Math.max(detalle.lineas.length, 1)}
          vacio={null}
        />
        <dl
          aria-label="Importes del pedido"
          className="ml-auto grid w-fit grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm"
        >
          {importes.map(({ nombre, valor }) => (
            <div key={nombre} className="contents">
              <dt
                className={
                  nombre === 'Total'
                    ? 'font-semibold text-texto'
                    : 'text-texto-suave'
                }
              >
                {nombre}
              </dt>
              <dd className="text-right font-mono tabular-nums text-texto">
                {moneda} {formatearImporte(valor)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {contenido.notas ? (
        <section aria-labelledby={`${ids}-notas`}>
          <h4 id={`${ids}-notas`} className="text-sm font-medium text-texto">
            Notas
          </h4>
          <p className="whitespace-pre-line text-sm text-texto-suave">
            {contenido.notas}
          </p>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variante="secundario" onClick={() => void copiar()}>
          {copiado === 'copiado' ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          Copiar texto
        </Button>
        <p role="status" className="text-sm text-texto-suave">
          {copiado === 'copiado'
            ? 'Texto copiado: el documento y el detalle del pedido.'
            : copiado === 'fallo'
              ? 'No se pudo copiar: seleccioná el texto y copialo a mano.'
              : ''}
        </p>
      </div>
    </div>
  )
}
