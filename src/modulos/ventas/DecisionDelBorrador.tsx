import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Lock, RotateCcw, XCircle } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { borradores } from '@/api/borradores'
import { comprobantes } from '@/api/comprobantes'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { Button } from '@/components/ui/button'
import { Field, Label } from '@/components/ui/label'
import { Modal, ModalContenido } from '@/components/ui/modal'
import {
  Select,
  SelectContenido,
  SelectOpcion,
  SelectTrigger,
  SelectValor,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  CLAVE_BORRADORES,
  claveDeBorrador,
  errorDeDecision,
  type ErrorDeDecision,
  errorDeMotivo,
  etiquetaDeComprobante,
  MOTIVO_DE_DESCARTE,
  ROLES_APROBACION,
  versionCorta,
} from '@/modulos/ventas/borradores'
import { CLAVE_COMPROBANTES } from '@/modulos/ventas/comprobantes'
import { ROLES_VENTAS } from '@/modulos/ventas/pedidos'
import type { Borrador } from '@/tipos/dominio'

const ALERTA =
  'rounded-control border border-peligro/40 bg-peligro/10 p-3 text-sm text-texto'
const SIN_COMPROBANTE = 'sin-comprobante'

/** La clave de Idempotency-Key de un intento: la misma mientras se reintenta
 *  exactamente lo mismo; otra si cambia lo que se manda. */
function useClavePorIntento() {
  const clave = useRef<{ firma: string; valor: string } | null>(null)
  return {
    para(firma: string): string {
      if (clave.current?.firma !== firma)
        clave.current = { firma, valor: crypto.randomUUID() }
      return clave.current.valor
    },
    olvidar() {
      clave.current = null
    },
  }
}

/** Después de aprobar o descartar: el borrador que volvió y todas las
 *  consultas de borradores (listado, detalle y bitácora) de nuevo. */
function useAlDecidir() {
  const consultas = useQueryClient()
  return (resultado?: Borrador) => {
    if (resultado)
      consultas.setQueryData(claveDeBorrador(resultado.id), resultado)
    void consultas.invalidateQueries({ queryKey: [CLAVE_BORRADORES] })
  }
}

/** Aprobar y descartar un borrador en revisión. Aprueba solo admin (para el
 *  resto el botón queda deshabilitado con la explicación); descartan admin
 *  y ventas. El permiso real lo aplica el backend. */
export function DecisionDelBorrador({
  borrador,
  clienteId,
  conCambiosLocales,
  alRecargar,
}: {
  borrador: Borrador
  /** El cliente del pedido: solo sus comprobantes se pueden vincular. */
  clienteId: string
  /** Hay cambios en la pantalla que no se guardan: no se aprueba eso. */
  conCambiosLocales: boolean
  /** El borrador cambió o ya se cerró: se recarga y se avisa. */
  alRecargar: (mensaje: string) => void
}) {
  const ids = useId()
  const { identidad } = useSesion()
  const aprueba = puede(identidad, ROLES_APROBACION)
  const descarta = puede(identidad, ROLES_VENTAS)
  const [dialogo, setDialogo] = useState<'aprobar' | 'descartar' | null>(null)
  const cerrar = () => setDialogo(null)
  const recargar = (mensaje: string) => {
    setDialogo(null)
    alRecargar(mensaje)
  }

  const motivoDeBloqueo = !aprueba
    ? 'Solo una persona con rol de administración puede aprobar.'
    : conCambiosLocales
      ? 'Se aprueba el texto guardado: volvé al texto de la IA para aprobar. Los cambios de la pantalla no se guardan.'
      : !borrador.hash_contenido
        ? 'El borrador no trae su versión: volvé a cargarlo.'
        : null

  return (
    <div className="space-y-2 border-t border-borde pt-3">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={motivoDeBloqueo !== null}
          aria-describedby={motivoDeBloqueo ? `${ids}-bloqueo` : undefined}
          onClick={() => setDialogo('aprobar')}
        >
          <CheckCircle2 className="size-4" aria-hidden /> Aprobar
        </Button>
        {descarta ? (
          <Button variante="secundario" onClick={() => setDialogo('descartar')}>
            <XCircle className="size-4" aria-hidden /> Descartar
          </Button>
        ) : null}
      </div>
      {motivoDeBloqueo ? (
        <p id={`${ids}-bloqueo`} className="text-sm text-texto-suave">
          {motivoDeBloqueo}
        </p>
      ) : null}

      <Modal
        open={dialogo === 'aprobar'}
        onOpenChange={(abierto) => !abierto && cerrar()}
      >
        {dialogo === 'aprobar' && borrador.hash_contenido ? (
          <DialogoDeAprobacion
            borrador={borrador}
            hash={borrador.hash_contenido}
            clienteId={clienteId}
            alCerrar={cerrar}
            alRecargar={recargar}
          />
        ) : null}
      </Modal>
      <Modal
        open={dialogo === 'descartar'}
        onOpenChange={(abierto) => !abierto && cerrar()}
      >
        {dialogo === 'descartar' ? (
          <DialogoDeDescarte
            borrador={borrador}
            alCerrar={cerrar}
            alRecargar={recargar}
          />
        ) : null}
      </Modal>
    </div>
  )
}

function DialogoDeAprobacion({
  borrador,
  hash,
  clienteId,
  alCerrar,
  alRecargar,
}: {
  borrador: Borrador
  hash: string
  clienteId: string
  alCerrar: () => void
  alRecargar: (mensaje: string) => void
}) {
  const ids = useId()
  const alDecidir = useAlDecidir()
  const clave = useClavePorIntento()
  const [elegido, setElegido] = useState(SIN_COMPROBANTE)
  const [error, setError] = useState<ErrorDeDecision | null>(null)
  const delCliente = useQuery({
    queryKey: [CLAVE_COMPROBANTES, 'del-cliente', clienteId],
    queryFn: () => comprobantes.listar({ cliente_id: clienteId }),
  })
  // Solo los del cliente del pedido, aunque la respuesta trajera otros.
  const opciones = (delCliente.data?.items ?? []).filter(
    (c) => c.cliente_id === clienteId,
  )

  const aprobar = useMutation({
    mutationFn: (datos: { comprobante_id: string | null; clave: string }) =>
      borradores.aprobar(
        borrador.id,
        { hash_contenido: hash, comprobante_id: datos.comprobante_id },
        datos.clave,
      ),
    onSuccess: (aprobado) => {
      clave.olvidar()
      alCerrar()
      alDecidir(aprobado)
    },
    onError: (e) => {
      const decision = errorDeDecision(e)
      if (decision.tipo === 'recargar') {
        alDecidir()
        alRecargar(decision.mensaje)
      } else setError(decision)
    },
  })
  const enviar = () => {
    if (aprobar.isPending) return
    setError(null)
    const comprobanteId = elegido === SIN_COMPROBANTE ? null : elegido
    aprobar.mutate({
      comprobante_id: comprobanteId,
      clave: clave.para(`${hash}|${comprobanteId ?? ''}`),
    })
  }
  const contenido = borrador.contenido

  return (
    <ModalContenido
      titulo="Aprobar el borrador"
      descripcion="Se aprueba exactamente este texto, tal como está guardado."
    >
      <div className="space-y-4 text-sm text-texto">
        {contenido ? (
          <figure
            aria-label="Texto que se aprueba"
            className="max-h-56 space-y-2 overflow-y-auto rounded-control border border-borde bg-carbon-900/40 p-3"
          >
            <p className="font-semibold">{contenido.encabezado}</p>
            <p className="whitespace-pre-line text-texto-suave">
              {contenido.cuerpo}
            </p>
            {contenido.notas ? (
              <p className="whitespace-pre-line text-texto-suave">
                {contenido.notas}
              </p>
            ) : null}
          </figure>
        ) : null}
        <p className="font-mono text-xs text-texto-suave">
          Versión {versionCorta(hash)}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor={`${ids}-comprobante`}>
            Comprobante de ARCA (opcional)
          </Label>
          <Select
            value={elegido}
            onValueChange={(valor) => {
              if (valor) setElegido(valor)
            }}
            disabled={aprobar.isPending}
          >
            <SelectTrigger
              id={`${ids}-comprobante`}
              aria-describedby={`${ids}-ayuda-comprobante`}
            >
              <SelectValor />
            </SelectTrigger>
            <SelectContenido>
              <SelectOpcion value={SIN_COMPROBANTE}>
                Sin comprobante
              </SelectOpcion>
              {opciones.map((c) => (
                <SelectOpcion key={c.id} value={c.id}>
                  {etiquetaDeComprobante(c)}
                </SelectOpcion>
              ))}
            </SelectContenido>
          </Select>
          <p
            id={`${ids}-ayuda-comprobante`}
            className="text-xs text-texto-suave"
          >
            {delCliente.isPending
              ? 'Buscando los comprobantes del cliente…'
              : delCliente.isError
                ? 'No se pudieron traer los comprobantes del cliente. Podés aprobar sin comprobante y vincularlo en una corrección.'
                : opciones.length === 0
                  ? 'Este cliente todavía no tiene comprobantes cargados.'
                  : 'Solo los comprobantes ya cargados del cliente de este pedido. El comprobante lo emite ARCA: acá solo se referencia.'}
          </p>
          {error?.tipo === 'comprobante' ? (
            <p role="alert" className="text-xs text-peligro-texto">
              {error.mensaje}
            </p>
          ) : null}
        </div>

        <ul className="space-y-2 rounded-control border border-aviso/40 bg-aviso/10 p-3">
          <li className="flex items-start gap-2">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Lo aprobado queda congelado: no se puede editar ni borrar. Si hay
              que cambiarlo, se genera una corrección.
            </span>
          </li>
          <li>
            El sistema guarda un PDF interno del borrador aprobado.{' '}
            <strong>No es un comprobante fiscal</strong>: la factura la emite
            ARCA.
          </li>
        </ul>

        {error && error.tipo !== 'comprobante' ? (
          <div role="alert" className={ALERTA}>
            <p>{error.mensaje}</p>
            {error.tipo === 'reintentar' ? (
              <Button
                variante="secundario"
                className="mt-2"
                cargando={aprobar.isPending}
                onClick={enviar}
              >
                <RotateCcw className="size-4" aria-hidden /> Reintentar
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button cargando={aprobar.isPending} onClick={enviar}>
            <CheckCircle2 className="size-4" aria-hidden /> Aprobar borrador
          </Button>
        </div>
      </div>
    </ModalContenido>
  )
}

function DialogoDeDescarte({
  borrador,
  alCerrar,
  alRecargar,
}: {
  borrador: Borrador
  alCerrar: () => void
  alRecargar: (mensaje: string) => void
}) {
  const ids = useId()
  const alDecidir = useAlDecidir()
  const clave = useClavePorIntento()
  const [motivo, setMotivo] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState<ErrorDeDecision | null>(null)
  const errorDelMotivo = intentado ? errorDeMotivo(motivo) : null

  const descartar = useMutation({
    mutationFn: (datos: { motivo: string; clave: string }) =>
      borradores.descartar(borrador.id, { motivo: datos.motivo }, datos.clave),
    onSuccess: (descartado) => {
      clave.olvidar()
      alCerrar()
      alDecidir(descartado)
    },
    onError: (e) => {
      const decision = errorDeDecision(e)
      if (decision.tipo === 'recargar') {
        alDecidir()
        alRecargar(decision.mensaje)
      } else setError(decision)
    },
  })
  const enviar = () => {
    if (descartar.isPending) return
    setIntentado(true)
    setError(null)
    if (errorDeMotivo(motivo)) return
    const texto = motivo.trim()
    descartar.mutate({ motivo: texto, clave: clave.para(texto) })
  }

  return (
    <ModalContenido
      titulo="Descartar el borrador"
      descripcion="El borrador queda descartado con su texto y el motivo, y no se puede aprobar después. Podés generar otro."
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(evento) => {
          evento.preventDefault()
          enviar()
        }}
      >
        <Field
          label="Motivo"
          htmlFor={`${ids}-motivo`}
          error={errorDelMotivo ?? undefined}
        >
          <Textarea
            id={`${ids}-motivo`}
            rows={4}
            value={motivo}
            maxLength={MOTIVO_DE_DESCARTE.maximo}
            invalido={errorDelMotivo !== null}
            aria-describedby={`${ids}-contador${errorDelMotivo ? ` ${ids}-motivo-error` : ''}`}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
        </Field>
        <p
          id={`${ids}-contador`}
          className="text-right text-xs tabular-nums text-texto-suave"
        >
          {motivo.length}/{MOTIVO_DE_DESCARTE.maximo}
        </p>
        {error ? (
          <p role="alert" className={ALERTA}>
            {error.mensaje}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundario" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variante="peligro"
            cargando={descartar.isPending}
          >
            <XCircle className="size-4" aria-hidden /> Descartar borrador
          </Button>
        </div>
      </form>
    </ModalContenido>
  )
}
