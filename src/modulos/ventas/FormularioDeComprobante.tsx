import { useQuery } from '@tanstack/react-query'
import { ScanLine } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { describirError, esApiError } from '@/api/client'
import { useSesion } from '@/auth/useSesion'
import type { Errores } from '@/components/catalogo/campos'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { BarraDeProgreso } from '@/components/ui/progreso'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { SelectorDeArchivo } from '@/components/ui/selector-de-archivo'
import { leerQrDelPdf } from '@/documentos/leerQrDelPdf'
import { subirArchivo } from '@/documentos/subirArchivo'
import {
  LETRAS,
  leerEntero,
  letraEsperada,
  nombreDeComprobante,
} from '@/lib/comprobantes'
import { hoyEnArgentina } from '@/lib/fechas'
import { leerQrDeArca } from '@/lib/qrDeArca'
import {
  aComprobanteCrear,
  borradorConQr,
  borradorInicial,
  borradorParaCliente,
  clientePorDocumento,
  errorDeArchivo,
  erroresDelAlta,
  mensajeDelAlta,
  monedasParaElegir,
  validarComprobante,
  type BorradorDeComprobante,
  type CampoDeComprobante,
  type ValoresDeAlta,
} from '@/modulos/ventas/comprobantes'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  clientesConBajas,
} from '@/modulos/ventas/pedidos'
import type {
  Cliente,
  ComprobanteCrear,
  Moneda,
  TipoComprobante,
} from '@/tipos/dominio'

/** El id del mensaje que pone Field (error o ayuda), para aria-describedby. */
const describir = (id: string, error?: string, ayuda?: string) =>
  error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined

type Props = {
  alGuardar: (datos: ComprobanteCrear) => Promise<unknown>
  alCancelar: () => void
  /** Lo que ya viene puesto (desde el pedido: su cliente y su moneda). */
  inicial?: ValoresDeAlta
}

/** El PDF ya subido: si se reintenta con el mismo archivo no se sube de nuevo. */
type Subida = { archivo: File; clave: string }

/** Qué pasó al buscar el QR de ARCA en el PDF elegido. */
type LecturaDelPdf =
  | { estado: 'leyendo' }
  | {
      estado: 'completado'
      avisos: string[]
      /** El cliente que se eligió por el CUIT del receptor, o null. */
      clienteDelQr: string | null
    }
  | { estado: 'sin_qr' }

/** Los campos que completa el QR: al completarlos se borran sus errores. */
const CAMPOS_DEL_QR: CampoDeComprobante[] = [
  'cliente_id',
  'tipo',
  'punto_venta',
  'numero',
  'fecha_emision',
  'moneda',
  'importe',
  'tipo_cambio',
]

/** Alta de un comprobante que ya emitió ARCA: todo se TRANSCRIBE del PDF.
 *  Al elegir el PDF se busca su código QR y, si está, completa el
 *  formulario; todo sigue editable y lo confirma la persona. La letra se
 *  sugiere según el cliente, pero se puede cambiar; si no coincide, el
 *  backend la rechaza y el error queda en el campo. Primero se sube el PDF
 *  y después se registra. */
export function FormularioDeComprobante(props: Props) {
  // Misma clave que los pedidos y el catálogo: comparten la caché.
  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })

  if (clientes.isError)
    return (
      <ErrorDePantalla
        error={describirError(clientes.error)}
        reintentar={() => void clientes.refetch()}
      />
    )
  if (clientes.isPending) return <Cargando columnas={2} filas={4} />
  return <Campos {...props} clientes={clientes.data} />
}

/** El formulario en sí: arranca cuando ya están los clientes, así el
 *  cliente que viene puesto ya sugiere su letra y su moneda. */
function Campos({
  alGuardar,
  alCancelar,
  inicial,
  clientes,
}: Props & { clientes: readonly Cliente[] }) {
  const { identidad } = useSesion()
  const [borrador, setBorrador] = useState<BorradorDeComprobante>(() =>
    borradorInicial(inicial, clientes),
  )
  const [archivo, setArchivo] = useState<File | null>(null)
  const [lectura, setLectura] = useState<LecturaDelPdf | null>(null)
  // Cada PDF elegido es una lectura nueva: si la persona cambia de archivo
  // mientras se lee el anterior, el resultado viejo se descarta.
  const ultimaLectura = useRef(0)
  const [subida, setSubida] = useState<Subida | null>(null)
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cliente = clientes.find((c) => c.id === borrador.cliente_id)
  const monedas = monedasParaElegir(cliente, borrador.moneda)
  const esperada = cliente ? letraEsperada(cliente) : null
  const conTipoDeCambio = borrador.moneda !== 'ARS'
  const hoy = hoyEnArgentina()

  const sinError = (...campos: CampoDeComprobante[]) =>
    setErrores((actuales) =>
      Object.fromEntries(
        Object.entries(actuales).filter(
          ([clave]) => !campos.includes(clave as CampoDeComprobante),
        ),
      ),
    )
  const cambiar = <K extends keyof BorradorDeComprobante>(
    campo: K,
    valor: BorradorDeComprobante[K],
  ) => {
    setBorrador((actual) => ({ ...actual, [campo]: valor }))
    sinError(campo)
  }
  const elegirCliente = (id: string) => {
    const elegido = clientes.find((c) => c.id === id)
    if (!elegido) return
    setBorrador((actual) => borradorParaCliente(actual, elegido))
    sinError('cliente_id', 'tipo', 'moneda', 'tipo_cambio')
  }
  const elegirMoneda = (moneda: Moneda) => {
    setBorrador((actual) => ({
      ...actual,
      moneda,
      tipo_cambio: moneda === 'ARS' ? '' : actual.tipo_cambio,
    }))
    sinError('moneda', 'tipo', 'tipo_cambio')
  }
  const elegirArchivo = (elegido: File | null) => {
    setArchivo(elegido)
    sinError('archivo')
    const lecturaNueva = ++ultimaLectura.current
    if (!elegido || errorDeArchivo(elegido)) {
      setLectura(null)
      return
    }
    setLectura({ estado: 'leyendo' })
    void completarConQr(elegido, lecturaNueva)
  }

  /** Busca el QR de ARCA en el PDF y, si está, completa el formulario. Si
   *  no está o no se puede leer, queda la carga a mano. */
  async function completarConQr(pdf: File, lecturaNueva: number) {
    const texto = await leerQrDelPdf(pdf).catch(() => null)
    if (lecturaNueva !== ultimaLectura.current) return
    const leido = texto ? leerQrDeArca(texto) : null
    if (!leido?.valido) {
      setLectura({ estado: 'sin_qr' })
      return
    }
    const delQr = clientePorDocumento(clientes, leido.datos.documento_receptor)
    // Sobre el borrador de ahora: la persona pudo escribir mientras se leía.
    setBorrador((actual) => borradorConQr(actual, leido.datos, clientes))
    sinError(...CAMPOS_DEL_QR)
    setLectura({
      estado: 'completado',
      avisos: leido.avisos,
      clienteDelQr: delQr?.nombre ?? null,
    })
  }

  async function subirPdf(pdf: File): Promise<string> {
    if (subida?.archivo === pdf) return subida.clave
    setProgreso(0)
    const clave = await subirArchivo(pdf, {
      tenantId: identidad?.tenantId ?? '',
      alAvanzar: setProgreso,
    })
    setSubida({ archivo: pdf, clave })
    return clave
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrados = validarComprobante(borrador, cliente, archivo)
    setErrores(encontrados)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0 || !archivo) return

    setGuardando(true)
    let datos: ComprobanteCrear | null = null
    try {
      datos = aComprobanteCrear(borrador, await subirPdf(archivo))
      await alGuardar(datos)
    } catch (error) {
      // Sin datos falló la subida: el error es del archivo.
      const deCampo = datos
        ? erroresDelAlta(error, datos)
        : { archivo: describirError(error).mensaje }
      // El backend no encontró el PDF: el próximo intento lo vuelve a subir.
      if (esApiError(error) && error.codigo === 'archivo_inexistente')
        setSubida(null)
      setErrores(deCampo)
      if (Object.keys(deCampo).length === 0)
        setErrorGeneral(mensajeDelAlta(error))
    } finally {
      setGuardando(false)
      setProgreso(null)
    }
  }

  const puntoVenta = leerEntero(borrador.punto_venta)
  const numero = leerEntero(borrador.numero)
  const impreso =
    borrador.tipo && puntoVenta && numero
      ? nombreDeComprobante({
          tipo: borrador.tipo,
          punto_venta: puntoVenta,
          numero,
        })
      : null

  const ayudaLetra =
    cliente && esperada
      ? borrador.tipo && borrador.tipo !== esperada
        ? `A este cliente le corresponde la factura ${esperada}. Revisá la letra del PDF.`
        : `Sugerida según el cliente. Copiá la que figura en el PDF.`
      : 'Se sugiere al elegir el cliente.'
  const ayudaNumero = impreso
    ? `Se va a ver como ${impreso}.`
    : 'Con o sin los ceros de adelante: 45 es lo mismo que 00000045.'
  const ayudaTipoDeCambio = `Pesos por ${borrador.moneda}, el que figura en el comprobante.`

  return (
    <form noValidate onSubmit={enviar} className="space-y-5">
      {/* Primero el PDF: si tiene el QR de ARCA, completa el resto. */}
      <Field
        label="PDF del comprobante"
        htmlFor="comprobante-archivo"
        error={errores.archivo}
      >
        <SelectorDeArchivo
          id="comprobante-archivo"
          archivo={archivo}
          alElegir={elegirArchivo}
          aceptar=".pdf,application/pdf"
          ayuda="El PDF que descargaste de ARCA, de hasta 10 MB. Si tiene el código QR, completamos los datos por vos."
          invalido={Boolean(errores.archivo)}
          deshabilitado={guardando}
          describedBy={
            errores.archivo ? 'comprobante-archivo-error' : undefined
          }
        />
      </Field>
      <AvisoDeLectura lectura={lectura} sinCliente={!cliente} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Cliente"
          htmlFor="comprobante-cliente"
          error={errores.cliente_id}
        >
          <Select value={borrador.cliente_id} onValueChange={elegirCliente}>
            <SelectTrigger
              id="comprobante-cliente"
              aria-invalid={errores.cliente_id ? true : undefined}
              aria-describedby={describir(
                'comprobante-cliente',
                errores.cliente_id,
              )}
            >
              <SelectValor placeholder="Elegí el cliente" />
            </SelectTrigger>
            <SelectContenido>
              {clientes.map((c) => (
                <SelectOpcion key={c.id} value={c.id}>
                  {c.activo ? c.nombre : `${c.nombre} (dado de baja)`}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
        <Field
          label="Letra"
          htmlFor="comprobante-letra"
          error={errores.tipo}
          ayuda={ayudaLetra}
        >
          <Select
            value={borrador.tipo}
            onValueChange={(v) => cambiar('tipo', v as TipoComprobante)}
          >
            <SelectTrigger
              id="comprobante-letra"
              aria-invalid={errores.tipo ? true : undefined}
              aria-describedby={describir(
                'comprobante-letra',
                errores.tipo,
                ayudaLetra,
              )}
            >
              <SelectValor placeholder="Elegí la letra" />
            </SelectTrigger>
            <SelectContenido>
              {LETRAS.map((l) => (
                <SelectOpcion key={l} value={l}>
                  Factura {l}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Punto de venta"
          htmlFor="comprobante-punto-venta"
          error={errores.punto_venta}
        >
          <Input
            id="comprobante-punto-venta"
            inputMode="numeric"
            autoComplete="off"
            placeholder="0001"
            value={borrador.punto_venta}
            invalido={Boolean(errores.punto_venta)}
            aria-describedby={describir(
              'comprobante-punto-venta',
              errores.punto_venta,
            )}
            onChange={(e) => cambiar('punto_venta', e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Número"
            htmlFor="comprobante-numero"
            error={errores.numero}
            ayuda={ayudaNumero}
          >
            <Input
              id="comprobante-numero"
              inputMode="numeric"
              autoComplete="off"
              placeholder="00000045"
              value={borrador.numero}
              invalido={Boolean(errores.numero)}
              aria-describedby={describir(
                'comprobante-numero',
                errores.numero,
                ayudaNumero,
              )}
              onChange={(e) => cambiar('numero', e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Fecha de emisión"
          htmlFor="comprobante-fecha"
          error={errores.fecha_emision}
        >
          <Input
            id="comprobante-fecha"
            type="date"
            max={hoy}
            value={borrador.fecha_emision}
            invalido={Boolean(errores.fecha_emision)}
            aria-describedby={describir(
              'comprobante-fecha',
              errores.fecha_emision,
            )}
            onChange={(e) => cambiar('fecha_emision', e.target.value)}
          />
        </Field>
        <Field
          label="Moneda"
          htmlFor="comprobante-moneda"
          error={errores.moneda}
          ayuda={
            cliente?.tipo === 'nacional'
              ? 'Venta nacional: en pesos, sin tipo de cambio.'
              : undefined
          }
        >
          <Select
            value={borrador.moneda}
            // Al cambiar las opciones (ARS → USD o EUR), el <select> oculto de
            // Radix avisa un valor vacío: solo cuenta una moneda del cliente.
            onValueChange={(v) => {
              const elegida = monedas.find((m) => m === v)
              if (elegida) elegirMoneda(elegida)
            }}
            disabled={monedas.length === 1}
          >
            <SelectTrigger id="comprobante-moneda">
              <SelectValor />
            </SelectTrigger>
            <SelectContenido>
              {monedas.map((m) => (
                <SelectOpcion key={m} value={m}>
                  {m}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Importe total (${borrador.moneda})`}
          htmlFor="comprobante-importe"
          error={errores.importe}
        >
          <Input
            id="comprobante-importe"
            inputMode="decimal"
            autoComplete="off"
            placeholder="640.500,00"
            value={borrador.importe}
            invalido={Boolean(errores.importe)}
            aria-describedby={describir('comprobante-importe', errores.importe)}
            onChange={(e) => cambiar('importe', e.target.value)}
          />
        </Field>
        {conTipoDeCambio ? (
          <Field
            label="Tipo de cambio"
            htmlFor="comprobante-tipo-cambio"
            error={errores.tipo_cambio}
            ayuda={ayudaTipoDeCambio}
          >
            <Input
              id="comprobante-tipo-cambio"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1180,50"
              value={borrador.tipo_cambio}
              invalido={Boolean(errores.tipo_cambio)}
              aria-describedby={describir(
                'comprobante-tipo-cambio',
                errores.tipo_cambio,
                ayudaTipoDeCambio,
              )}
              onChange={(e) => cambiar('tipo_cambio', e.target.value)}
            />
          </Field>
        ) : null}
      </div>

      {progreso !== null ? (
        <BarraDeProgreso valor={progreso} etiqueta="Subiendo el PDF" />
      ) : null}
      {errorGeneral ? (
        <p
          role="alert"
          className="rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto"
        >
          {errorGeneral}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variante="secundario"
          onClick={alCancelar}
          disabled={guardando}
        >
          Cancelar
        </Button>
        <Button type="submit" cargando={guardando}>
          Cargar comprobante
        </Button>
      </div>
    </form>
  )
}

/** Lo que pasó con el QR, en una región que los lectores de pantalla
 *  anuncian. Vacía hasta que se elige un PDF. */
function AvisoDeLectura({
  lectura,
  sinCliente,
}: {
  lectura: LecturaDelPdf | null
  /** Todavía no hay cliente elegido: se pide que lo elija. */
  sinCliente: boolean
}) {
  const avisos =
    lectura?.estado !== 'completado'
      ? []
      : [
          ...(lectura.clienteDelQr
            ? [`Elegimos el cliente ${lectura.clienteDelQr} por su CUIT.`]
            : sinCliente
              ? [
                  'No encontramos un cliente con el CUIT de la factura: elegilo.',
                ]
              : []),
          ...lectura.avisos,
        ]
  return (
    <div role="status" className="empty:hidden">
      {lectura?.estado === 'leyendo' ? (
        <p className="flex items-center gap-2 text-sm text-texto-suave">
          <ScanLine aria-hidden className="size-4 shrink-0" />
          Buscando el código QR de la factura…
        </p>
      ) : lectura?.estado === 'completado' ? (
        <div className="space-y-1 rounded-control border border-ok/40 bg-ok/10 p-3 text-sm text-texto">
          <p className="font-medium">
            Completamos los datos con el código QR de la factura. Revisalos
            antes de guardar.
          </p>
          {avisos.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-texto-suave">
              {avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : lectura?.estado === 'sin_qr' ? (
        <p className="rounded-control border border-borde bg-panel-alto/50 p-3 text-sm text-texto-suave">
          No encontramos el código QR de ARCA en el PDF: completá los datos a
          mano.
        </p>
      ) : null}
    </div>
  )
}
