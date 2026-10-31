/** Exportación: lo común a las pantallas de embarques (backend #109).
 *  Reglas en docs/dominio.md, "Exportación" y "Modalidades de envío". */
import type { Rol } from '@/auth/identidad'
import type { Campo, Valores } from '@/components/catalogo/campos'
import { errorDeAwb } from '@/lib/awb'
import {
  type Embarque,
  type EmbarqueActualizar,
  type EmbarqueCrear,
  type EstadoEmbarque,
} from '@/tipos/dominio'

/** Los mismos que require_role de app/routers/embarques.py. Leer, todos. */
export const ROLES_EXPORTACION: readonly Rol[] = ['admin', 'ventas']

export const CLAVE_EMBARQUES = 'embarques'

function errorDeDestino(valor: string): string | null {
  const codigo = valor.toUpperCase()
  if (!/^[A-Z]{2}$/.test(codigo))
    return 'Usá el código de país de dos letras (CL, ES, DE…).'
  if (codigo === 'AR') return 'Un embarque de exportación no va a Argentina.'
  return null
}

const destino: Campo = {
  nombre: 'destino_pais',
  etiqueta: 'País de destino',
  requerido: true,
  max: 2,
  placeholder: 'CL',
  ayuda:
    'Envío directo: el país del cliente. Consolidado: el del hub donde se retira.',
  validar: errorDeDestino,
}

const fechaVuelo: Campo = {
  nombre: 'fecha_vuelo',
  etiqueta: 'Fecha del vuelo',
  tipo: 'fecha',
  requerido: true,
}

const awb: Campo = {
  nombre: 'awb',
  etiqueta: 'Guía aérea (AWB)',
  placeholder: '045-12345675',
  ayuda: 'Opcional hasta reservar el vuelo. Se necesita para pasar a tránsito.',
  validar: errorDeAwb,
}

export const CAMPOS_ALTA: readonly Campo[] = [destino, fechaVuelo, awb]

/** El estado no se edita acá: avanza con botones (SIGUIENTE_PASO) y se
 *  cancela con confirmación, como el pedido. */
export const CAMPOS_EDICION: readonly Campo[] = [destino, fechaVuelo, awb]

/** El paso que sigue a cada estado, con el texto del botón. Entregado y
 *  cancelado son finales. Tránsito y entregado piden la guía aérea (el
 *  CHECK ck_embarque_awb_al_despachar de la 0010). */
export const SIGUIENTE_PASO: Partial<
  Record<EstadoEmbarque, { estado: EstadoEmbarque; texto: string }>
> = {
  en_preparacion: { estado: 'en_transito', texto: 'Pasar a tránsito' },
  en_transito: { estado: 'entregado', texto: 'Marcar entregado' },
}

/** Se cancela mientras el envío no llegó. */
export const sePuedeCancelar = (estado: EstadoEmbarque): boolean =>
  estado === 'en_preparacion' || estado === 'en_transito'

export const aEmbarqueCrear = (v: Valores): EmbarqueCrear => ({
  destino_pais: v.destino_pais.trim().toUpperCase(),
  fecha_vuelo: v.fecha_vuelo,
  awb: v.awb?.trim() || null,
})

export const valoresDeEmbarque = (e: Embarque): Valores => ({
  destino_pais: e.destino_pais,
  fecha_vuelo: e.fecha_vuelo,
  awb: e.awb ?? '',
})

export const aEmbarqueActualizar = (v: Valores): EmbarqueActualizar =>
  aEmbarqueCrear(v)
