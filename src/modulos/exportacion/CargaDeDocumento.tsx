import { useState, type FormEvent } from 'react'
import { describirError } from '@/api/client'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { BarraDeProgreso } from '@/components/ui/progreso'
import { SelectorDeArchivo } from '@/components/ui/selector-de-archivo'
import { subirArchivo } from '@/documentos/subirArchivo'
import { validarArchivo } from '@/documentos/validarArchivo'
import type { DocumentoCrear, TipoDocumentoEmbarque } from '@/tipos/dominio'

type Errores = Partial<Record<'numero' | 'fecha' | 'archivo', string>>

const MAXIMO_NUMERO = 50 // Identificacion del backend (app/schemas/produccion.py)

/** Carga un documento del embarque: el PDF va directo a S3 y el sistema
 *  registra el número TRANSCRIPTO del documento real (nunca se genera). */
export function CargaDeDocumento({
  tipo,
  alGuardar,
  alCancelar,
}: {
  tipo: TipoDocumentoEmbarque
  alGuardar: (datos: DocumentoCrear) => Promise<unknown>
  alCancelar: () => void
}) {
  const { identidad } = useSesion()
  const [numero, setNumero] = useState('')
  const [fecha, setFecha] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [errores, setErrores] = useState<Errores>({})
  const [progreso, setProgreso] = useState<number | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  function validar(): Errores {
    const encontrados: Errores = {}
    const limpio = numero.trim()
    if (!limpio) encontrados.numero = 'Transcribí el número del documento.'
    else if (limpio.length > MAXIMO_NUMERO)
      encontrados.numero = `El número admite hasta ${MAXIMO_NUMERO} caracteres.`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha))
      encontrados.fecha = 'Elegí la fecha de emisión.'
    if (!archivo)
      encontrados.archivo = 'Adjuntá el PDF o la imagen del documento.'
    else {
      const invalido = validarArchivo(archivo)
      if (invalido) encontrados.archivo = invalido
    }
    return encontrados
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrados = validar()
    setErrores(encontrados)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0 || !archivo) return

    setProgreso(0)
    try {
      const clave = await subirArchivo(archivo, {
        tenantId: identidad?.tenantId ?? '',
        alAvanzar: setProgreso,
      })
      await alGuardar({
        tipo,
        numero: numero.trim(),
        fecha,
        archivo_s3_key: clave,
      })
    } catch (error) {
      const { mensaje, codigo } = describirError(error)
      setErrorGeneral(codigo ? `${mensaje} (${codigo})` : mensaje)
      setProgreso(null)
    }
  }

  const ocupado = progreso !== null
  const ayudaArchivo = 'PDF, JPG o PNG de hasta 10 MB.'

  return (
    <form noValidate onSubmit={enviar} className="space-y-4">
      <Field
        label="Número del documento"
        htmlFor="doc-numero"
        error={errores.numero}
        ayuda="Tal como figura en el documento emitido."
      >
        <Input
          id="doc-numero"
          value={numero}
          invalido={Boolean(errores.numero)}
          aria-describedby={
            errores.numero ? 'doc-numero-error' : 'doc-numero-ayuda'
          }
          onChange={(e) => setNumero(e.target.value)}
        />
      </Field>
      <Field label="Fecha de emisión" htmlFor="doc-fecha" error={errores.fecha}>
        <Input
          id="doc-fecha"
          type="date"
          value={fecha}
          invalido={Boolean(errores.fecha)}
          aria-describedby={errores.fecha ? 'doc-fecha-error' : undefined}
          onChange={(e) => setFecha(e.target.value)}
        />
      </Field>
      <Field label="Archivo" htmlFor="doc-archivo" error={errores.archivo}>
        <SelectorDeArchivo
          id="doc-archivo"
          archivo={archivo}
          alElegir={setArchivo}
          aceptar=".pdf,.jpg,.jpeg,.png"
          ayuda={ayudaArchivo}
          invalido={Boolean(errores.archivo)}
          deshabilitado={ocupado}
          describedBy={errores.archivo ? 'doc-archivo-error' : undefined}
        />
      </Field>

      {ocupado ? (
        <BarraDeProgreso valor={progreso ?? 0} etiqueta="Subiendo el archivo" />
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
          disabled={ocupado}
        >
          Cancelar
        </Button>
        <Button type="submit" cargando={ocupado}>
          Cargar documento
        </Button>
      </div>
    </form>
  )
}
