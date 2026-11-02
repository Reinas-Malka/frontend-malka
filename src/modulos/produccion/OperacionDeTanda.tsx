import { useState, type FormEvent } from 'react'
import type { Errores, Valores } from '@/components/catalogo/campos'
import { Button } from '@/components/ui/button'
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
import {
  ACCIONES,
  aOperacion,
  ayudaDeCantidad,
  cabenEn,
  conFecha,
  disponiblesPara,
  errorDeOperacion,
  resumenDe,
  validarOperacion,
  valoresIniciales,
} from '@/modulos/produccion/operaciones'
import type {
  AccionDeTanda,
  Banco,
  OperacionCrear,
  Parque,
  TandaDetalle,
} from '@/tipos/dominio'

type Props = {
  accion: AccionDeTanda
  tanda: TandaDetalle
  /** Solo los activos: en uno dado de baja no se opera. */
  parques: readonly Parque[]
  bancos: readonly Banco[]
  alGuardar: (operacion: OperacionCrear) => Promise<unknown>
  alCancelar: () => void
}

const ETIQUETA_CANTIDAD: Record<AccionDeTanda, string> = {
  descartar: 'Celdas a descartar',
  introducir: 'Celdas a introducir',
  cosechar: 'Reinas cosechadas',
  pasar_a_banco: 'Reinas a pasar',
}

const ETIQUETA_FECHA: Record<AccionDeTanda, string> = {
  descartar: 'Fecha del descarte',
  introducir: 'Fecha de introducción',
  cosechar: 'Fecha de la cosecha',
  pasar_a_banco: '',
}

const id = (campo: string) => `operacion-${campo}`
/** El id del texto que describe el campo: el error o la ayuda (Field). */
const describir = (campo: string, error: string | undefined) =>
  `${id(campo)}-${error ? 'error' : 'ayuda'}`

/** El formulario de una operación por lote: cantidad, fecha y, según la
 *  operación, el parque o el banco. Nunca celdas ni núcleos. */
export function OperacionDeTanda({
  accion,
  tanda,
  parques,
  bancos,
  alGuardar,
  alCancelar,
}: Props) {
  const resumen = resumenDe(tanda)
  const hoy = hoyEnArgentina()
  const [valores, setValores] = useState<Valores>(() =>
    valoresIniciales(accion, resumen, hoy),
  )
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const banco = bancos.find((b) => b.id === valores.banco_id)

  const cambiar = (campo: string, valor: string) => {
    setValores((actuales) => ({ ...actuales, [campo]: valor }))
    setErrores((actuales) =>
      Object.fromEntries(Object.entries(actuales).filter(([c]) => c !== campo)),
    )
  }
  // Al elegir un banco con la cantidad vacía, se propone lo que entra.
  const elegirBanco = (bancoId: string) => {
    const elegido = bancos.find((b) => b.id === bancoId)
    cambiar('banco_id', bancoId)
    if (elegido && !valores.cantidad.trim()) {
      const propuesta = Math.min(resumen.sinBanco, cabenEn(elegido))
      if (propuesta > 0) cambiar('cantidad', String(propuesta))
    }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrados = validarOperacion(accion, valores, {
      tanda,
      bancos,
      hoy,
    })
    setErrores(encontrados)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0) return

    setGuardando(true)
    try {
      await alGuardar(aOperacion(accion, valores))
    } catch (error) {
      const { campo, mensaje } = errorDeOperacion(error, accion)
      if (campo) setErrores({ [campo]: mensaje })
      else setErrorGeneral(mensaje)
    } finally {
      setGuardando(false)
    }
  }

  const selector = (
    campo: 'parque_id' | 'banco_id',
    etiqueta: string,
    opciones: { valor: string; etiqueta: string }[],
    alElegir: (valor: string) => void,
    vacio: string,
  ) => (
    <Field
      label={etiqueta}
      htmlFor={id(campo)}
      error={errores[campo]}
      ayuda={opciones.length === 0 ? vacio : undefined}
    >
      <Select value={valores[campo]} onValueChange={alElegir}>
        <SelectTrigger
          id={id(campo)}
          aria-invalid={errores[campo] ? true : undefined}
          aria-describedby={
            errores[campo] || opciones.length === 0
              ? describir(campo, errores[campo])
              : undefined
          }
        >
          <SelectValor placeholder="Elegí una opción" />
        </SelectTrigger>
        <SelectContenido>
          {opciones.map((o) => (
            <SelectOpcion key={o.valor} value={o.valor}>
              {o.etiqueta}
            </SelectOpcion>
          ))}
        </SelectContenido>
      </Select>
    </Field>
  )

  return (
    <form noValidate onSubmit={enviar} className="space-y-4">
      {accion === 'introducir'
        ? selector(
            'parque_id',
            'Parque',
            parques.map((p) => ({
              valor: p.id,
              etiqueta: `${p.nombre} · ${
                p.nucleos_activos === 1
                  ? '1 núcleo activo'
                  : p.nucleos_activos === 0
                    ? 'sin núcleos activos'
                    : `${p.nucleos_activos} núcleos activos`
              }`,
            })),
            (v) => cambiar('parque_id', v),
            'No hay parques activos: dá de alta uno en Parques.',
          )
        : null}

      {accion === 'pasar_a_banco'
        ? selector(
            'banco_id',
            'Banco',
            bancos.map((b) => ({
              valor: b.id,
              etiqueta: `${b.identificador} · caben ${cabenEn(b)}`,
            })),
            elegirBanco,
            'No hay bancos activos: dá de alta uno en Bancos.',
          )
        : null}

      <Field
        label={ETIQUETA_CANTIDAD[accion]}
        htmlFor={id('cantidad')}
        error={errores.cantidad}
        ayuda={ayudaDeCantidad(accion, resumen, valores.cantidad, banco)}
      >
        <Input
          id={id('cantidad')}
          inputMode="numeric"
          autoComplete="off"
          value={valores.cantidad}
          invalido={Boolean(errores.cantidad)}
          aria-describedby={describir('cantidad', errores.cantidad)}
          className="block sm:max-w-48"
          onChange={(e) => cambiar('cantidad', e.target.value)}
        />
      </Field>

      {conFecha(accion) ? (
        <Field
          label={ETIQUETA_FECHA[accion]}
          htmlFor={id('fecha')}
          error={errores.fecha}
          ayuda="Puede ser anterior a hoy si se carga tarde."
        >
          <Input
            id={id('fecha')}
            type="date"
            min={tanda.fecha_traslarve}
            max={hoy}
            value={valores.fecha ?? ''}
            invalido={Boolean(errores.fecha)}
            aria-describedby={describir('fecha', errores.fecha)}
            className="block sm:max-w-48"
            onChange={(e) => cambiar('fecha', e.target.value)}
          />
        </Field>
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
          disabled={guardando}
          onClick={alCancelar}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          cargando={guardando}
          disabled={disponiblesPara(accion, resumen) === 0}
        >
          {ACCIONES[accion].guardar}
        </Button>
      </div>
    </form>
  )
}
