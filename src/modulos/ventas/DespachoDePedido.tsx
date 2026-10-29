import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { describirError, esApiError } from '@/api/client'
import { disponibilidad } from '@/api/disponibilidad'
import type { Errores } from '@/components/catalogo/campos'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { hoyEnArgentina } from '@/lib/fechas'
import { errorDeFormatoDeDespacho } from '@/lib/pedidos'
import { cn } from '@/lib/utils'
import {
  aDespacho,
  asignadas,
  claveDeSalida,
  erroresDelDespacho,
  existenciasPorRaza,
  salidaVacia,
  salidasIniciales,
  validarDespacho,
  type Existencia,
  type Salida,
  type Salidas,
} from '@/modulos/ventas/despacho'
import { CLAVE_DISPONIBILIDAD } from '@/modulos/ventas/pedidos'
import type { Despacho, Pedido, PedidoItem } from '@/tipos/dominio'

type Props = {
  pedido: Pedido
  nombreDeItem: (id: string) => string
  nombreDeRaza: (id: string) => string
  alGuardar: (despacho: Despacho) => Promise<unknown>
  alCancelar: () => void
}

/** El id del mensaje de error que pone Field, para aria-describedby. */
const describir = (id: string, error: string | undefined) =>
  error ? `${id}-error` : undefined

/** Entregar: por cada línea, de qué bancos salen sus reinas y cuántas. La
 *  línea sale entera (no hay entrega parcial) y cada banco da como mucho
 *  las enjauladas que tiene de esa raza. */
export function DespachoDePedido({
  pedido,
  nombreDeItem,
  nombreDeRaza,
  alGuardar,
  alCancelar,
}: Props) {
  const existencia = useQuery({
    queryKey: [CLAVE_DISPONIBILIDAD],
    queryFn: () => disponibilidad.listar(),
  })
  const [salidas, setSalidas] = useState<Salidas>(() =>
    salidasIniciales(pedido),
  )
  const [fecha, setFecha] = useState(hoyEnArgentina)
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<{
    mensaje: string
    detalle: string | null
  } | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (existencia.isPending) return <Cargando columnas={3} filas={3} />
  if (existencia.isError)
    return (
      <ErrorDePantalla
        error={describirError(existencia.error)}
        reintentar={() => void existencia.refetch()}
      />
    )

  const existencias = existenciasPorRaza(existencia.data)
  const lineas = [...pedido.items].sort(
    (a, b) => a.numero_linea - b.numero_linea,
  )

  // Al tocar una línea se van sus errores: los de las filas se corren al
  // quitar una, y lo que falta o sobra cambia con cualquier fila.
  const sinErroresDe = (lineaId: string) =>
    setErrores((actuales) =>
      Object.fromEntries(
        Object.entries(actuales).filter(
          ([clave]) => !clave.startsWith(lineaId),
        ),
      ),
    )
  const cambiarFilas = (
    lineaId: string,
    cambio: (filas: Salida[]) => Salida[],
  ) => {
    setSalidas((actuales) => ({
      ...actuales,
      [lineaId]: cambio(actuales[lineaId] ?? []),
    }))
    sinErroresDe(lineaId)
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrados = validarDespacho(pedido, salidas, existencias)
    const despacho = aDespacho(pedido, salidas, fecha)
    // El formato del schema Entregar. Con lo demás bien, lo único que puede
    // fallar es la fecha futura.
    const formato =
      Object.keys(encontrados).length === 0
        ? errorDeFormatoDeDespacho(despacho)
        : null
    if (formato) encontrados.fecha = formato
    setErrores(encontrados)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0) return

    setGuardando(true)
    try {
      await alGuardar(despacho)
    } catch (error) {
      const deFila = erroresDelDespacho(error, salidas)
      setErrores(deFila)
      if (Object.keys(deFila).length === 0)
        setErrorGeneral(
          esApiError(error)
            ? {
                mensaje: error.mensaje,
                detalle: [error.codigo, error.requestId]
                  .filter(Boolean)
                  .join(' · '),
              }
            : { mensaje: 'No se pudo entregar el pedido.', detalle: null },
        )
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={enviar} className="space-y-5">
      <Field
        label="Fecha de entrega"
        htmlFor="despacho-fecha"
        error={errores.fecha}
        ayuda="Puede ser anterior a hoy si se carga tarde."
      >
        <Input
          id="despacho-fecha"
          type="date"
          max={hoyEnArgentina()}
          value={fecha}
          invalido={Boolean(errores.fecha)}
          aria-describedby={
            errores.fecha ? 'despacho-fecha-error' : 'despacho-fecha-ayuda'
          }
          className="sm:max-w-48"
          onChange={(e) => {
            setFecha(e.target.value)
            setErrores((actuales) =>
              Object.fromEntries(
                Object.entries(actuales).filter(([clave]) => clave !== 'fecha'),
              ),
            )
          }}
        />
      </Field>

      {lineas.map((linea) => (
        <LineaDelDespacho
          key={linea.id}
          linea={linea}
          nombre={`${nombreDeItem(linea.item_vendible_id)} · ${nombreDeRaza(linea.raza_id)}`}
          filas={salidas[linea.id] ?? []}
          existencias={existencias.get(linea.raza_id) ?? []}
          errores={errores}
          alCambiar={(cambio) => cambiarFilas(linea.id, cambio)}
        />
      ))}

      {errorGeneral ? (
        <div
          role="alert"
          className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
        >
          {errorGeneral.mensaje}
          {errorGeneral.detalle ? (
            <span className="mt-1 block font-mono text-xs text-texto-suave">
              {errorGeneral.detalle}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secundario" onClick={alCancelar}>
          Cancelar
        </Button>
        <Button type="submit" cargando={guardando}>
          Entregar pedido
        </Button>
      </div>
    </form>
  )
}

/** Una línea: el contador "8 de 12" y una fila por banco. */
function LineaDelDespacho({
  linea,
  nombre,
  filas,
  existencias,
  errores,
  alCambiar,
}: {
  linea: PedidoItem
  nombre: string
  filas: readonly Salida[]
  existencias: readonly Existencia[]
  errores: Errores
  alCambiar: (cambio: (filas: Salida[]) => Salida[]) => void
}) {
  const total = asignadas(filas)
  const completa = total === linea.cantidad
  const errorDeLinea = errores[linea.id]
  const idContador = `linea-${linea.id}-contador`

  const cambiar = (n: number, campo: 'banco' | 'cantidad', valor: string) =>
    alCambiar((actuales) =>
      actuales.map((s, i) => (i === n ? { ...s, [campo]: valor } : s)),
    )
  // Al elegir un banco con la cantidad vacía, se propone lo que falta,
  // hasta lo que tiene ese banco.
  const elegirBanco = (n: number, banco: string) =>
    alCambiar((actuales) => {
      const faltan =
        linea.cantidad - asignadas(actuales.filter((_, i) => i !== n))
      const hay = existencias.find((e) => e.banco === banco)?.reinas ?? 0
      const propuesta = Math.min(faltan, hay)
      return actuales.map((s, i) =>
        i !== n
          ? s
          : {
              ...s,
              banco,
              cantidad:
                s.cantidad || propuesta <= 0 ? s.cantidad : String(propuesta),
            },
      )
    })

  return (
    <fieldset
      className="rounded-tarjeta border border-borde p-3"
      aria-describedby={idContador}
    >
      <legend className="px-1 text-sm font-medium text-texto">
        Línea {linea.numero_linea}: {nombre}
      </legend>
      <p
        id={idContador}
        aria-live="polite"
        className={cn(
          'font-mono text-sm tabular-nums',
          completa ? 'text-ok-texto' : 'text-texto-suave',
        )}
      >
        {total} de {linea.cantidad}
      </p>
      {errorDeLinea ? (
        <p role="alert" className="text-xs text-peligro-texto">
          {errorDeLinea}
        </p>
      ) : null}

      {existencias.length === 0 ? (
        <p className="mt-2 text-sm text-texto-suave">
          No hay reinas enjauladas de esta raza en ningún banco.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {filas.map((fila, n) => {
            const id = (campo: string) => `salida-${fila.clave}-${campo}`
            const error = (campo: 'banco' | 'cantidad') =>
              errores[claveDeSalida(linea.id, n, campo)]
            // Un banco va una sola vez por línea: no se ofrece el de otra fila.
            const ocupados = new Set(
              filas.filter((_, i) => i !== n).map((s) => s.banco),
            )
            return (
              <div
                key={fila.clave}
                role="group"
                aria-label={`Banco ${n + 1} de la línea ${linea.numero_linea}`}
                className="grid gap-3 sm:grid-cols-[1fr_7rem_auto] sm:items-start"
              >
                <Field
                  label="Banco"
                  htmlFor={id('banco')}
                  error={error('banco')}
                >
                  <Select
                    value={fila.banco}
                    onValueChange={(v) => elegirBanco(n, v)}
                  >
                    <SelectTrigger
                      id={id('banco')}
                      aria-invalid={error('banco') ? true : undefined}
                      aria-describedby={describir(id('banco'), error('banco'))}
                    >
                      <SelectValor placeholder="Elegí el banco" />
                    </SelectTrigger>
                    <SelectContenido>
                      {existencias
                        .filter((e) => !ocupados.has(e.banco))
                        .map((e) => (
                          <SelectOpcion key={e.banco} value={e.banco}>
                            {`${e.nombre} · ${e.reinas} enjauladas`}
                          </SelectOpcion>
                        ))}
                    </SelectContenido>
                  </Select>
                </Field>
                <Field
                  label="Reinas"
                  htmlFor={id('cantidad')}
                  error={error('cantidad')}
                >
                  <Input
                    id={id('cantidad')}
                    inputMode="numeric"
                    value={fila.cantidad}
                    invalido={Boolean(error('cantidad'))}
                    aria-describedby={describir(
                      id('cantidad'),
                      error('cantidad'),
                    )}
                    onChange={(e) => cambiar(n, 'cantidad', e.target.value)}
                  />
                </Field>
                <Button
                  type="button"
                  variante="fantasma"
                  tamano="chico"
                  className="sm:mt-7"
                  aria-label={`Quitar el banco ${n + 1} de la línea ${linea.numero_linea}`}
                  disabled={filas.length === 1}
                  onClick={() =>
                    alCambiar((actuales) => actuales.filter((_, i) => i !== n))
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                </Button>
              </div>
            )
          })}
          <Button
            type="button"
            variante="secundario"
            tamano="chico"
            // Una fila por banco: con todos elegidos no hay otro para agregar.
            disabled={filas.length >= existencias.length}
            onClick={() =>
              alCambiar((actuales) => [...actuales, salidaVacia()])
            }
          >
            <Plus aria-hidden className="size-4" /> Agregar banco
          </Button>
        </div>
      )}
    </fieldset>
  )
}
