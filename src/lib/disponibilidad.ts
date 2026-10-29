/** repositorio_disponibilidad.calcular del backend (#33, ADR 0014), para la
 *  API simulada. Hay un solo stock, el de las celdas:
 *  - enjauladas: celdas 'enjaulada' de tandas de la raza, en un banco o no;
 *  - reservadas: la cantidad de las reservas activas de la raza;
 *  - disponible = enjauladas − reservadas;
 *  - bancos: dónde están las enjauladas. Es ubicación, no "disponible por
 *    banco". */
import type {
  Banco,
  Celda,
  DisponibilidadReinas,
  ExistenciaEnBanco,
  Raza,
  Reserva,
  Tanda,
} from '@/tipos/dominio'

export type EstadoDelStock = {
  razas: readonly Pick<Raza, 'id' | 'nombre' | 'activo'>[]
  tandas: readonly Pick<Tanda, 'id' | 'raza_id'>[]
  celdas: readonly Pick<Celda, 'tanda_id' | 'banco_id' | 'estado'>[]
  reservas: readonly Pick<Reserva, 'raza_id' | 'cantidad' | 'estado'>[]
  bancos: readonly Pick<Banco, 'id' | 'identificador'>[]
}

/** Como ORDER BY b.identificador NULLS LAST: "sin banco" va al final. */
const porIdentificador = (a: ExistenciaEnBanco, b: ExistenciaEnBanco) =>
  a.identificador === null
    ? 1
    : b.identificador === null
      ? -1
      : a.identificador.localeCompare(b.identificador)

/** Una fila por raza, ordenadas por nombre. Las razas activas aparecen
 *  aunque no tengan reinas; las dadas de baja, solo si les quedan. */
export function calcularDisponibilidad(
  estado: EstadoDelStock,
  razaId?: string,
): DisponibilidadReinas[] {
  const razaDeTanda = new Map(estado.tandas.map((t) => [t.id, t.raza_id]))
  const identificadores = new Map(
    estado.bancos.map((b) => [b.id, b.identificador]),
  )
  const enjauladas = estado.celdas.filter((c) => c.estado === 'enjaulada')

  return estado.razas
    .filter((raza) => !razaId || raza.id === razaId)
    .map((raza) => {
      const propias = enjauladas.filter(
        (c) => razaDeTanda.get(c.tanda_id) === raza.id,
      )
      const reservadas = estado.reservas
        .filter((r) => r.estado === 'activa' && r.raza_id === raza.id)
        .reduce((total, r) => total + r.cantidad, 0)
      const porBanco = new Map<string | null, number>()
      for (const c of propias)
        porBanco.set(c.banco_id, (porBanco.get(c.banco_id) ?? 0) + 1)
      const bancos = [...porBanco]
        .map(([banco_id, reinas]) => ({
          banco_id,
          identificador: banco_id
            ? (identificadores.get(banco_id) ?? null)
            : null,
          reinas,
        }))
        .sort(porIdentificador)
      return {
        activa: raza.activo,
        fila: {
          raza_id: raza.id,
          raza: raza.nombre,
          enjauladas: propias.length,
          reservadas,
          disponible: propias.length - reservadas,
          bancos,
        },
      }
    })
    .filter(({ activa, fila }) => activa || fila.enjauladas > 0)
    .map(({ fila }) => fila)
    .sort(
      (a, b) =>
        a.raza.localeCompare(b.raza) || a.raza_id.localeCompare(b.raza_id),
    )
}
