import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
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
import { subirArchivo } from '@/documentos/subirArchivo'
import {
  LETRAS,
  leerEntero,
  letraEsperada,
  nombreDeComprobante,
} from '@/lib/comprobantes'
import { hoyEnArgentina } from '@/lib/fechas'
import {
  BORRADOR_VACIO,
  aComprobanteCrear,
  borradorParaCliente,
  erroresDelAlta,
  mensajeDelAlta,
  monedasDelCliente,
  validarComprobante,
  type BorradorDeComprobante,
  type CampoDeComprobante,
} from '@/modulos/ventas/comprobantes'
import {
  CLAVE_CLIENTES_CON_BAJAS,
  clientesConBajas,
} from '@/modulos/ventas/pedidos'
import type { ComprobanteCrear, Moneda, TipoComprobante } from '@/tipos/dominio'

/** El id del mensaje que pone Field (error o ayuda), para aria-describedby. */
const describir = (id: string, error?: string, ayuda?: string) =>
  error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined

type Props = {
  alGuardar: (datos: ComprobanteCrear) => Promise<unknown>
  alCancelar: () => void
}

/** El PDF ya subido: si se reintenta con el mismo archivo no se sube de nuevo. */
type Subida = { archivo: File; clave: string }

/** Alta de un comprobante que ya emitió ARCA: todo se TRANSCRIBE del PDF.
 *  La letra se sugiere según el cliente, pero se puede cambiar; si no
 *  coincide, el backend la rechaza y el error queda en el campo. Primero se
 *  sube el PDF y después se registra. */
export function FormularioDeComprobante({ alGuardar, alCancelar }: Props) {
  const { identidad } = useSesion()
  // Misma clave que los pedidos y el catálogo: comparten la caché.
  const clientes = useQuery({
    queryKey: CLAVE_CLIENTES_CON_BAJAS,
    queryFn: clientesConBajas,
  })

  const [borrador, setBorrador] =
    useState<BorradorDeComprobante>(BORRADOR_VACIO)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subida, setSubida] = useState<Subida | null>(null)
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [progreso, setProgreso] = useState<number | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (clientes.isError)
    return (
      <ErrorDePantalla
        error={describirError(clientes.error)}
        reintentar={() => void clientes.refetch()}
      />
    )
  if (clientes.isPending) return <Cargando columnas={2} filas={4} />

  const cliente = clientes.data.find((c) => c.id === borrador.cliente_id)
  const monedas = monedasDelCliente(cliente)
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
    const elegido = clientes.data.find((c) => c.id === id)
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
              {clientes.data.map((c) => (
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
          ayuda="El PDF que descargaste de ARCA, de hasta 10 MB."
          invalido={Boolean(errores.archivo)}
          deshabilitado={guardando}
          describedBy={
            errores.archivo ? 'comprobante-archivo-error' : undefined
          }
        />
      </Field>

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
