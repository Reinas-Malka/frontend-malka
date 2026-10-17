import { useState, type FormEvent } from 'react'
import { esApiError } from '@/api/client'
import {
  camposVisibles,
  erroresDelBackend,
  validarValores,
  type Campo,
  type Errores,
  type Valores,
} from '@/components/catalogo/campos'
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

type Props = {
  campos: readonly Campo[]
  iniciales: Valores
  textoGuardar?: string
  alGuardar: (valores: Valores) => Promise<unknown>
  alCancelar: () => void
}

/** Formulario genérico: valida en el cliente, y si el backend igual
 *  responde 422 marca el campo que corresponde (details.campos). */
export function FormularioRecurso({
  campos,
  iniciales,
  textoGuardar = 'Guardar',
  alGuardar,
  alCancelar,
}: Props) {
  const [valores, setValores] = useState<Valores>(iniciales)
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<{
    mensaje: string
    detalle: string | null
  } | null>(null)
  const [guardando, setGuardando] = useState(false)

  const cambiar = (nombre: string, valor: string) => {
    setValores((v) => ({ ...v, [nombre]: valor }))
    setErrores((actuales) =>
      Object.fromEntries(
        Object.entries(actuales).filter(([campo]) => campo !== nombre),
      ),
    )
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrados = validarValores(campos, valores)
    setErrores(encontrados)
    setErrorGeneral(null)
    if (Object.keys(encontrados).length > 0) return

    setGuardando(true)
    try {
      await alGuardar(valores)
    } catch (error) {
      // Solo cuentan los errores de campos visibles: uno oculto no se vería.
      const visibles = new Set(
        camposVisibles(campos, valores).map((c) => c.nombre),
      )
      const deCampo = Object.fromEntries(
        Object.entries(erroresDelBackend(error, campos)).filter(([nombre]) =>
          visibles.has(nombre),
        ),
      )
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
            : { mensaje: 'No se pudo guardar.', detalle: null },
        )
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={enviar} className="space-y-4">
      {camposVisibles(campos, valores).map((campo) => {
        const id = `campo-${campo.nombre}`
        const error = errores[campo.nombre]
        const describedBy = error
          ? `${id}-error`
          : campo.ayuda
            ? `${id}-ayuda`
            : undefined
        const valor = valores[campo.nombre] ?? ''
        return (
          <Field
            key={campo.nombre}
            label={campo.etiqueta}
            htmlFor={id}
            error={error}
            ayuda={campo.ayuda}
          >
            {campo.tipo === 'seleccion' ? (
              <Select
                value={valor}
                onValueChange={(v) => cambiar(campo.nombre, v)}
              >
                <SelectTrigger
                  id={id}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy}
                >
                  <SelectValor
                    placeholder={campo.placeholder ?? 'Elegí una opción'}
                  />
                </SelectTrigger>
                <SelectContenido>
                  {(campo.opciones?.(valores) ?? []).map((o) => (
                    <SelectOpcion key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </SelectOpcion>
                  ))}
                </SelectContenido>
              </Select>
            ) : campo.tipo === 'texto-largo' ? (
              <textarea
                id={id}
                value={valor}
                rows={3}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                placeholder={campo.placeholder}
                onChange={(e) => cambiar(campo.nombre, e.target.value)}
                className="w-full rounded-control border border-borde bg-carbon-900/60 px-3 py-2 text-sm text-texto placeholder:text-texto-suave focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-acento aria-[invalid=true]:border-peligro"
              />
            ) : (
              <Input
                id={id}
                value={valor}
                type={campo.tipo === 'fecha' ? 'date' : undefined}
                inputMode={campo.tipo === 'numero' ? 'numeric' : undefined}
                invalido={Boolean(error)}
                aria-describedby={describedBy}
                placeholder={campo.placeholder}
                onChange={(e) => cambiar(campo.nombre, e.target.value)}
              />
            )}
          </Field>
        )
      })}

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
          {textoGuardar}
        </Button>
      </div>
    </form>
  )
}
