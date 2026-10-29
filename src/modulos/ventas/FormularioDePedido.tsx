import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { describirError, esApiError } from '@/api/client'
import { itemsVendibles, razas } from '@/api/recursos'
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
import { useListado } from '@/hooks/useRecurso'
import { MAX_LINEAS, MONEDAS_POR_TIPO } from '@/lib/pedidos'
import { PAISES_EXTRANJEROS } from '@/lib/paises'
import { catalogoRazas } from '@/modulos/produccion/catalogos'
import { catalogoItemsVendibles } from '@/modulos/ventas/catalogos'
import {
  CABECERA_VACIA,
  CLAVE_CLIENTES_CON_BAJAS,
  aPedidoCrear,
  cabeceraParaCliente,
  claveDeLinea,
  clientesConBajas,
  erroresDelAlta,
  lineaVacia,
  validarAlta,
  type CabeceraDePedido,
  type CampoDeLinea,
  type LineaDePedido,
} from '@/modulos/ventas/pedidos'
import {
  INCOTERMS,
  type Incoterm,
  type Moneda,
  type PedidoCrear,
} from '@/tipos/dominio'

/** El valor de "sin incoterm": el Select de Radix no acepta ''. */
const SIN_INCOTERM = 'sin-incoterm'

/** El id del mensaje de error que pone Field, para aria-describedby. */
const describir = (id: string, error: string | undefined) =>
  error ? `${id}-error` : undefined

type Props = {
  alGuardar: (datos: PedidoCrear) => Promise<unknown>
  alCancelar: () => void
}

/** Alta de un pedido: la cabecera según el tipo de cliente y las líneas
 *  (ítem, raza, cantidad y precio). Valida con lib/pedidos.ts antes de
 *  mandar, y si el backend igual rechaza, marca el campo o la línea. */
export function FormularioDePedido({ alGuardar, alCancelar }: Props) {
  // Mismas claves que las pantallas de catálogo: comparten la caché.
  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })
  const items = useListado(catalogoItemsVendibles.clave, itemsVendibles)
  const lasRazas = useListado(catalogoRazas.clave, razas)

  const [cabecera, setCabecera] = useState<CabeceraDePedido>(CABECERA_VACIA)
  const [lineas, setLineas] = useState<LineaDePedido[]>(() => [lineaVacia()])
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<{
    mensaje: string
    detalle: string | null
  } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const consultas = [clientes, items, lasRazas]
  const cargando =
    consultas.some((c) => c.isPending) || !items.completo || !lasRazas.completo
  const fallo = consultas.find((c) => c.isError)
  if (fallo)
    return (
      <ErrorDePantalla
        error={describirError(fallo.error)}
        reintentar={() => consultas.forEach((c) => void c.refetch())}
      />
    )
  if (cargando) return <Cargando columnas={4} filas={3} />

  // Solo lo activo: a un cliente, ítem o raza dado de baja no se le vende.
  const activos = clientes.data?.filter((c) => c.activo) ?? []
  const itemsActivos = items.filas.filter((i) => i.activo)
  const razasActivas = lasRazas.filas.filter((r) => r.activo)
  const cliente = activos.find((c) => c.id === cabecera.cliente_id)
  const exportacion = cliente?.tipo === 'exportacion'

  // Al tocar un campo se va su error, y el de la combinación.
  const sinError = (...claves: string[]) =>
    setErrores((actuales) =>
      Object.fromEntries(
        Object.entries(actuales).filter(
          ([clave]) => clave !== 'pedido' && !claves.includes(clave),
        ),
      ),
    )
  const cambiarCabecera = <K extends keyof CabeceraDePedido>(
    campo: K,
    valor: CabeceraDePedido[K],
  ) => {
    setCabecera((actual) => ({ ...actual, [campo]: valor }))
    sinError(campo)
  }
  const elegirCliente = (id: string) => {
    const elegido = activos.find((c) => c.id === id)
    if (!elegido) return
    setCabecera((actual) => cabeceraParaCliente(actual, elegido))
    sinError('cliente_id', 'moneda', 'destino_pais', 'incoterm')
  }
  const cambiarLinea = (n: number, campo: CampoDeLinea, valor: string) => {
    setLineas((actuales) =>
      actuales.map((l, i) => (i === n ? { ...l, [campo]: valor } : l)),
    )
    sinError(claveDeLinea(n, campo))
  }
  const agregarLinea = () =>
    setLineas((actuales) => [...actuales, lineaVacia()])
  // Las claves de error van por posición: al quitar una línea las de abajo
  // se corren, así que se borran las de todas las líneas.
  const quitarLinea = (n: number) => {
    setLineas((actuales) => actuales.filter((_, i) => i !== n))
    setErrores((actuales) =>
      Object.fromEntries(
        Object.entries(actuales).filter(
          ([clave]) => !clave.startsWith('items'),
        ),
      ),
    )
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrados = validarAlta(cabecera, lineas, cliente)
    setErrores(encontrados)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0) return

    setGuardando(true)
    try {
      await alGuardar(aPedidoCrear(cabecera, lineas))
    } catch (error) {
      const deCampo = erroresDelAlta(error, lineas)
      setErrores(deCampo)
      if (Object.keys(deCampo).length === 0) {
        setErrorGeneral(
          esApiError(error)
            ? {
                mensaje: error.mensaje,
                detalle: [error.codigo, error.requestId]
                  .filter(Boolean)
                  .join(' · '),
              }
            : { mensaje: 'No se pudo crear el pedido.', detalle: null },
        )
      }
    } finally {
      setGuardando(false)
    }
  }

  const alerta = errores.pedido
    ? { mensaje: errores.pedido, detalle: null }
    : errorGeneral

  return (
    <form noValidate onSubmit={enviar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Cliente"
          htmlFor="pedido-cliente"
          error={errores.cliente_id}
          ayuda={
            cliente && !exportacion
              ? 'Venta nacional: en ARS, sin destino ni incoterm.'
              : undefined
          }
        >
          <Select value={cabecera.cliente_id} onValueChange={elegirCliente}>
            <SelectTrigger
              id="pedido-cliente"
              aria-invalid={errores.cliente_id ? true : undefined}
              aria-describedby={describir('pedido-cliente', errores.cliente_id)}
            >
              <SelectValor placeholder="Elegí el cliente" />
            </SelectTrigger>
            <SelectContenido>
              {activos.map((c) => (
                <SelectOpcion key={c.id} value={c.id}>
                  {c.nombre}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
        <Field
          label="Fecha de entrega"
          htmlFor="pedido-fecha"
          error={errores.fecha_entrega_solicitada}
        >
          <Input
            id="pedido-fecha"
            type="date"
            value={cabecera.fecha_entrega_solicitada}
            invalido={Boolean(errores.fecha_entrega_solicitada)}
            aria-describedby={describir(
              'pedido-fecha',
              errores.fecha_entrega_solicitada,
            )}
            onChange={(e) =>
              cambiarCabecera('fecha_entrega_solicitada', e.target.value)
            }
          />
        </Field>
      </div>

      {exportacion ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Moneda" htmlFor="pedido-moneda" error={errores.moneda}>
            <Select
              value={cabecera.moneda}
              onValueChange={(v) => cambiarCabecera('moneda', v as Moneda)}
            >
              <SelectTrigger id="pedido-moneda">
                <SelectValor />
              </SelectTrigger>
              <SelectContenido>
                {MONEDAS_POR_TIPO.exportacion.map((m) => (
                  <SelectOpcion key={m} value={m}>
                    {m}
                  </SelectOpcion>
                ))}
              </SelectContenido>
            </Select>
          </Field>
          <Field
            label="Destino"
            htmlFor="pedido-destino"
            error={errores.destino_pais}
            ayuda="El país del cliente, o el del hub si el envío es consolidado."
          >
            <Select
              value={cabecera.destino_pais}
              onValueChange={(v) => cambiarCabecera('destino_pais', v)}
            >
              <SelectTrigger
                id="pedido-destino"
                aria-invalid={errores.destino_pais ? true : undefined}
                aria-describedby={describir(
                  'pedido-destino',
                  errores.destino_pais,
                )}
              >
                <SelectValor placeholder="Elegí el país" />
              </SelectTrigger>
              <SelectContenido>
                {PAISES_EXTRANJEROS.map((p) => (
                  <SelectOpcion key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </SelectOpcion>
                ))}
              </SelectContenido>
            </Select>
          </Field>
          <Field
            label="Incoterm"
            htmlFor="pedido-incoterm"
            error={errores.incoterm}
          >
            <Select
              value={cabecera.incoterm || SIN_INCOTERM}
              onValueChange={(v) =>
                cambiarCabecera(
                  'incoterm',
                  v === SIN_INCOTERM ? '' : (v as Incoterm),
                )
              }
            >
              <SelectTrigger id="pedido-incoterm">
                <SelectValor />
              </SelectTrigger>
              <SelectContenido>
                <SelectOpcion value={SIN_INCOTERM}>Sin incoterm</SelectOpcion>
                {INCOTERMS.map((i) => (
                  <SelectOpcion key={i} value={i}>
                    {i}
                  </SelectOpcion>
                ))}
              </SelectContenido>
            </Select>
          </Field>
        </div>
      ) : null}

      <div className="space-y-3">
        {lineas.map((linea, n) => (
          <LineaDelFormulario
            key={linea.clave}
            n={n}
            linea={linea}
            errores={errores}
            moneda={cabecera.moneda}
            items={itemsActivos}
            razas={razasActivas}
            alCambiar={(campo, valor) => cambiarLinea(n, campo, valor)}
            alQuitar={lineas.length > 1 ? () => quitarLinea(n) : undefined}
          />
        ))}
        {errores.items ? (
          <p role="alert" className="text-sm text-peligro-texto">
            {errores.items}
          </p>
        ) : null}
        <Button
          type="button"
          variante="secundario"
          tamano="chico"
          disabled={lineas.length >= MAX_LINEAS}
          onClick={agregarLinea}
        >
          <Plus aria-hidden className="size-4" /> Agregar línea
        </Button>
      </div>

      {alerta ? (
        <div
          role="alert"
          className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
        >
          {alerta.mensaje}
          {alerta.detalle ? (
            <span className="mt-1 block font-mono text-xs text-texto-suave">
              {alerta.detalle}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variante="secundario" onClick={alCancelar}>
          Cancelar
        </Button>
        <Button type="submit" cargando={guardando}>
          Crear pedido
        </Button>
      </div>
    </form>
  )
}

type Opcion = { id: string; nombre: string }

/** Una línea: un fieldset con su número, así cada campo se nombra "Ítem"
 *  dentro de "Línea 2" sin ids repetidos. */
function LineaDelFormulario({
  n,
  linea,
  errores,
  moneda,
  items,
  razas,
  alCambiar,
  alQuitar,
}: {
  n: number
  linea: LineaDePedido
  errores: Errores
  moneda: Moneda
  items: readonly Opcion[]
  razas: readonly Opcion[]
  alCambiar: (campo: CampoDeLinea, valor: string) => void
  /** Sin él no se puede quitar: el pedido lleva al menos una línea. */
  alQuitar?: () => void
}) {
  const id = (campo: CampoDeLinea) => `linea-${linea.clave}-${campo}`
  const error = (campo: CampoDeLinea) => errores[claveDeLinea(n, campo)]
  const desplegable = (
    campo: 'item_vendible_id' | 'raza_id',
    opciones: readonly Opcion[],
    placeholder: string,
  ) => (
    <Select value={linea[campo]} onValueChange={(v) => alCambiar(campo, v)}>
      <SelectTrigger
        id={id(campo)}
        aria-invalid={error(campo) ? true : undefined}
        aria-describedby={describir(id(campo), error(campo))}
      >
        <SelectValor placeholder={placeholder} />
      </SelectTrigger>
      <SelectContenido>
        {opciones.map((o) => (
          <SelectOpcion key={o.id} value={o.id}>
            {o.nombre}
          </SelectOpcion>
        ))}
      </SelectContenido>
    </Select>
  )

  return (
    <fieldset className="rounded-tarjeta border border-borde p-3">
      <legend className="px-1 text-sm font-medium text-texto">
        Línea {n + 1}
      </legend>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_9rem_auto] sm:items-start">
        <Field
          label="Ítem"
          htmlFor={id('item_vendible_id')}
          error={error('item_vendible_id')}
        >
          {desplegable('item_vendible_id', items, 'Elegí el ítem')}
        </Field>
        <Field label="Raza" htmlFor={id('raza_id')} error={error('raza_id')}>
          {desplegable('raza_id', razas, 'Elegí la raza')}
        </Field>
        <Field
          label="Cantidad"
          htmlFor={id('cantidad')}
          error={error('cantidad')}
        >
          <Input
            id={id('cantidad')}
            inputMode="numeric"
            value={linea.cantidad}
            invalido={Boolean(error('cantidad'))}
            aria-describedby={describir(id('cantidad'), error('cantidad'))}
            onChange={(e) => alCambiar('cantidad', e.target.value)}
          />
        </Field>
        <Field
          label={`Precio (${moneda})`}
          htmlFor={id('precio_unitario')}
          error={error('precio_unitario')}
        >
          <Input
            id={id('precio_unitario')}
            inputMode="decimal"
            placeholder="1500,50"
            value={linea.precio_unitario}
            invalido={Boolean(error('precio_unitario'))}
            aria-describedby={describir(
              id('precio_unitario'),
              error('precio_unitario'),
            )}
            onChange={(e) => alCambiar('precio_unitario', e.target.value)}
          />
        </Field>
        <Button
          type="button"
          variante="fantasma"
          tamano="chico"
          className="sm:mt-7"
          aria-label={`Quitar la línea ${n + 1}`}
          disabled={!alQuitar}
          onClick={alQuitar}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
    </fieldset>
  )
}
