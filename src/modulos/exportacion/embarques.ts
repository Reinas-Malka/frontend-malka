/** Exportación: lo común a las pantallas de embarques (backend #109).
 *  Reglas en docs/dominio.md, "Exportación" y "Modalidades de envío". */
import type { Rol } from '@/auth/identidad'
import type { Campo, Valores } from '@/components/catalogo/campos'
import { errorDeAwb } from '@/lib/awb'
import {
  ESTADOS_EMBARQUE,
  NOMBRE_DE_ESTADO_EMBARQUE,
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

export const CAMPOS_EDICION: readonly Campo[] = [
  destino,
  fechaVuelo,
  awb,
  {
    nombre: 'estado',
    etiqueta: 'Estado',
    tipo: 'seleccion',
    requerido: true,
    opciones: () =>
      ESTADOS_EMBARQUE.map((e) => ({
        valor: e,
        etiqueta: NOMBRE_DE_ESTADO_EMBARQUE[e],
      })),
    validar: (estado, valores) =>
      (estado === 'en_transito' || estado === 'entregado') &&
      !valores.awb?.trim()
        ? 'Para pasar a tránsito o entregado, cargá la guía aérea.'
        : null,
  },
]

export const aEmbarqueCrear = (v: Valores): EmbarqueCrear => ({
  destino_pais: v.destino_pais.trim().toUpperCase(),
  fecha_vuelo: v.fecha_vuelo,
  awb: v.awb?.trim() || null,
})

export const valoresDeEmbarque = (e: Embarque): Valores => ({
  destino_pais: e.destino_pais,
  fecha_vuelo: e.fecha_vuelo,
  awb: e.awb ?? '',
  estado: e.estado,
})

export const aEmbarqueActualizar = (v: Valores): EmbarqueActualizar => ({
  ...aEmbarqueCrear(v),
  estado: v.estado as EstadoEmbarque,
})
