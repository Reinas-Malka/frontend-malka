/** El plan de varios pasos del asistente simulado: "creá un parque Casa
 *  Santi, ubicación Grand Bell, capacidad 100, con 10 núcleos" arma, como el
 *  backend, dos propuestas en una respuesta: el parque (paso 1) y sus
 *  núcleos (paso 2), con el marcador {{ref:<id>.id}} donde va el id del
 *  parque que todavía no existe. Sin red ni modelo. */
import type { Propuesta, RespuestaAsistente } from '@/api/asistente'

const ROLES_PRODUCCION = ['admin', 'produccion']
const CAPACIDAD_MINIMA = 50
const UBICACION_POR_DEFECTO = 'A definir'

/** ¿Pide crear un parque? (texto ya sin tildes y en minúsculas) */
export const PIDE_PARQUE =
  /\b(crea|crear|creame|carga|cargar|cargame|arma|armar|armame|hace|haceme|alta)\b.*\bparque\b/

const FIN = String.raw`(?=,|\s+con\s+\d|\s+capacidad|\s+ubicaci|\s*$)`
const NOMBRE = new RegExp(String.raw`parque\s+(?:llamado\s+)?(.+?)${FIN}`, 'i')
const UBICACION = new RegExp(String.raw`ubicaci[oó]n\s+(.+?)${FIN}`, 'i')
const CAPACIDAD = /capacidad\s+(?:de\s+)?(\d{1,5})/i
const NUCLEOS = /(\d{1,4})\s+n[uú]cleos/i

/** Lo que se entendió del pedido (con las mayúsculas del usuario). */
export function leerPedidoDeParque(texto: string) {
  const nucleos = Number(NUCLEOS.exec(texto)?.[1] ?? 0)
  const capacidad = Number(CAPACIDAD.exec(texto)?.[1] ?? 0)
  return {
    nombre: NOMBRE.exec(texto)?.[1]?.trim() ?? '',
    ubicacion: UBICACION.exec(texto)?.[1]?.trim() || UBICACION_POR_DEFECTO,
    capacidad: capacidad || Math.max(nucleos, CAPACIDAD_MINIMA),
    nucleos,
  }
}

export function proponerParqueConNucleos(texto: string): RespuestaAsistente {
  const pedido = leerPedidoDeParque(texto)
  if (!pedido.nombre)
    return {
      texto:
        '¿Cómo se llama el parque? Decime también la ubicación y la capacidad en núcleos.',
      consultas: [],
      propuestas: [],
    }
  const parque: Propuesta = {
    id: crypto.randomUUID(),
    accion: 'crear_parque',
    metodo: 'POST',
    ruta: '/api/v1/parques',
    cuerpo: {
      nombre: pedido.nombre,
      ubicacion: pedido.ubicacion,
      capacidad_max: pedido.capacidad,
    },
    resumen: [
      { etiqueta: 'Nombre', valor: pedido.nombre },
      { etiqueta: 'Ubicación', valor: pedido.ubicacion },
      { etiqueta: 'Capacidad', valor: `${pedido.capacidad} núcleos` },
    ],
    roles_permitidos: ROLES_PRODUCCION,
    paso: 1,
    depende_de: [],
  }
  const propuestas = [parque]
  if (pedido.nucleos > 0 && pedido.nucleos <= pedido.capacidad)
    propuestas.push({
      id: crypto.randomUUID(),
      accion: 'crear_nucleos',
      metodo: 'POST',
      ruta: `/api/v1/parques/{{ref:${parque.id}.id}}/nucleos`,
      cuerpo: { cantidad: pedido.nucleos },
      resumen: [
        { etiqueta: 'Parque', valor: pedido.nombre },
        { etiqueta: 'Núcleos a crear', valor: String(pedido.nucleos) },
        {
          etiqueta: 'Después del alta',
          valor: `${pedido.nucleos} de ${pedido.capacidad} núcleos`,
        },
      ],
      roles_permitidos: ROLES_PRODUCCION,
      paso: 2,
      depende_de: [parque.id],
    })
  return {
    texto:
      propuestas.length > 1
        ? `Te armé un plan de 2 pasos: el parque ${pedido.nombre} y sus ${pedido.nucleos} núcleos.\nConfirmalo entero o paso a paso: no se guarda nada hasta que confirmes.`
        : `Te armé el alta del parque ${pedido.nombre}.\nRevisala en la tarjeta: no se guarda nada hasta que la confirmes.`,
    consultas: [],
    propuestas,
  }
}
