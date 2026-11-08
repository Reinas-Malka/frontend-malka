import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { nucleosDeParque } from '@/api/nucleosDeParque'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { PaginaCatalogo } from '@/components/catalogo/PaginaCatalogo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Modal, ModalContenido } from '@/components/ui/modal'
import {
  catalogoParques,
  catalogoParquesCon,
} from '@/modulos/produccion/catalogos'
import {
  errorDeCantidadDeNucleos,
  lugarEn,
  mensajeDeErrorDeNucleos,
  resumenDeNucleosAgregados,
} from '@/modulos/produccion/nucleosDeParque'
import type { Parque } from '@/tipos/dominio'

/** Parques de fecundación: el catálogo más "Agregar núcleos" por cantidad
 *  (backend #155). El sistema los pone en una fila nueva del parque. */
export default function ParquesPage() {
  const { identidad } = useSesion()
  const escribe = puede(identidad, catalogoParques.rolesEscritura)
  const consultas = useQueryClient()
  // El parque elegido y la Idempotency-Key del alta, fija mientras el modal
  // está abierto: un reintento no crea los núcleos dos veces.
  const [abierto, setAbierto] = useState<{
    parque: Parque
    clave: string
  } | null>(null)
  const [aviso, setAviso] = useState('')

  const agregar = useMutation({
    mutationFn: ({
      parque,
      cantidad,
      clave,
    }: {
      parque: Parque
      cantidad: number
      clave: string
    }) => nucleosDeParque.crear(parque.id, { cantidad }, clave),
    onSuccess: async (creados, { parque }) => {
      await Promise.all(
        ['parques', 'nucleos'].map((clave) =>
          consultas.invalidateQueries({ queryKey: [clave] }),
        ),
      )
      setAviso(resumenDeNucleosAgregados(creados, parque.nombre))
      setAbierto(null)
    },
  })
  const cerrar = () => !agregar.isPending && setAbierto(null)

  return (
    <>
      <PaginaCatalogo
        config={catalogoParquesCon(
          escribe
            ? (parque) => {
                agregar.reset()
                setAviso('')
                setAbierto({ parque, clave: crypto.randomUUID() })
              }
            : undefined,
        )}
        controles={
          aviso ? (
            <p
              role="status"
              className="rounded-control border border-borde bg-panel p-3 text-sm text-texto"
            >
              {aviso}
            </p>
          ) : null
        }
      />
      <Modal open={abierto !== null} onOpenChange={(a) => !a && cerrar()}>
        {abierto ? (
          <ModalContenido
            titulo={`Agregar núcleos a ${abierto.parque.nombre}`}
            descripcion="Escribí cuántos. El sistema los pone en una fila nueva del parque, en las posiciones 1, 2, 3…"
          >
            <FormularioDeNucleos
              key={abierto.clave}
              parque={abierto.parque}
              alGuardar={(cantidad) =>
                agregar.mutateAsync({
                  parque: abierto.parque,
                  cantidad,
                  clave: abierto.clave,
                })
              }
              alCancelar={cerrar}
            />
          </ModalContenido>
        ) : null}
      </Modal>
    </>
  )
}

function FormularioDeNucleos({
  parque,
  alGuardar,
  alCancelar,
}: {
  parque: Parque
  alGuardar: (cantidad: number) => Promise<unknown>
  alCancelar: () => void
}) {
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const lugar = lugarEn(parque)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    const encontrado = errorDeCantidadDeNucleos(cantidad, parque)
    setError(encontrado)
    setErrorGeneral(null)
    if (encontrado) return
    setGuardando(true)
    try {
      await alGuardar(Number(cantidad.trim()))
    } catch (e) {
      setErrorGeneral(mensajeDeErrorDeNucleos(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <form noValidate onSubmit={enviar} className="space-y-4">
      <Field
        label="Cantidad de núcleos"
        htmlFor="nucleos-cantidad"
        error={error ?? undefined}
        ayuda={`Tiene ${parque.nucleos_activos} de ${parque.capacidad_max}: entran ${lugar} más.`}
      >
        <Input
          id="nucleos-cantidad"
          inputMode="numeric"
          autoComplete="off"
          value={cantidad}
          invalido={Boolean(error)}
          aria-describedby={
            error ? 'nucleos-cantidad-error' : 'nucleos-cantidad-ayuda'
          }
          className="block sm:max-w-48"
          onChange={(e) => {
            setCantidad(e.target.value)
            setError(null)
          }}
        />
      </Field>
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
        <Button type="submit" cargando={guardando}>
          Agregar núcleos
        </Button>
      </div>
    </form>
  )
}
