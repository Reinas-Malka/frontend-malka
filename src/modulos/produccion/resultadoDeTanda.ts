/** Dónde se introdujo una tanda y qué salió de ella, sin React (prueba del
 *  07/11: "se pierde la información de dónde la tanda es introducida" y
 *  "cuántas reinas salen de esa tanda"). Sale de `introducciones` y
 *  `resultado` del detalle (backend #155), que no cambian al cosechar,
 *  pasar a banco o despachar: el núcleo y la fecha quedan en cada celda. */
import type { TandaDetalle } from '@/tipos/dominio'

/** Una línea del resumen de introducción, lista para mostrar. */
export type ResumenDeIntroduccion = {
  clave: string
  texto: string
}

/** "12/10" de "2026-10-12": el día y el mes, sin el año. */
function diaYMes(fecha: string): string {
  const [, mes, dia] = fecha.slice(0, 10).split('-')
  return `${dia}/${mes}`
}

const plural = (n: number, una: string, varias: string) =>
  `${n} ${n === 1 ? una : varias}`

/** "(2 por núcleo)" o "(2 o 3 por núcleo)": el reparto es parejo, así que
 *  ningún núcleo tiene más de una celda de diferencia con otro. */
export function celdasPorNucleo(celdas: number, nucleos: number): string {
  if (nucleos <= 0) return ''
  const menos = Math.floor(celdas / nucleos)
  const mas = Math.ceil(celdas / nucleos)
  return menos === mas
    ? `(${menos} por núcleo)`
    : `(${menos} o ${mas} por núcleo)`
}

/** El resumen persistente de dónde entró la tanda, una línea por parque y
 *  fecha: "Introducida el 12/10 en Parque Norte: 270 celdas en 135 núcleos
 *  (2 por núcleo)". El nombre lo trae el backend; si viniera vacío, el del
 *  catálogo. */
export function resumenDeIntroduccion(
  tanda: Pick<TandaDetalle, 'introducciones'>,
  nombreDeParque: (id: string) => string,
): ResumenDeIntroduccion[] {
  return tanda.introducciones.map((i) => ({
    clave: `${i.parque_id}-${i.fecha_introduccion}`,
    texto: `Introducida el ${diaYMes(i.fecha_introduccion)} en ${i.parque_nombre || nombreDeParque(i.parque_id)}: ${plural(i.celdas, 'celda', 'celdas')} en ${plural(i.nucleos, 'núcleo', 'núcleos')} ${celdasPorNucleo(i.celdas, i.nucleos)}`,
  }))
}

/** Una fila del bloque "Resultado de la tanda". */
export type FilaDeResultado = { clave: string; nombre: string; valor: number }

/** Qué salió de la tanda, en el orden en que se lee: lo que entró al
 *  parque, lo cosechado y a dónde fue (cada banco, sin banco, despachadas),
 *  lo descartado con y sin núcleo, y lo que sigue en el parque. Las
 *  enjauladas por banco vienen en `bancos`. */
export function filasDeResultado(
  tanda: Pick<TandaDetalle, 'resultado' | 'bancos'>,
  formatearFecha: (fecha: string) => string,
): FilaDeResultado[] {
  const r = tanda.resultado
  return [
    {
      clave: 'introducidas',
      nombre: 'Introducidas en el parque',
      valor: r.introducidas,
    },
    {
      clave: 'cosechadas',
      nombre: r.fecha_cosecha
        ? `Cosechadas el ${formatearFecha(r.fecha_cosecha)} (enjauladas y despachadas)`
        : 'Cosechadas (enjauladas y despachadas)',
      valor: r.cosechadas,
    },
    ...tanda.bancos.map((b) => ({
      clave: `banco-${b.banco_id}`,
      nombre: `En el banco ${b.identificador}`,
      valor: b.reinas,
    })),
    ...(r.enjauladas_sin_banco > 0
      ? [
          {
            clave: 'sin-banco',
            nombre: 'Enjauladas todavía sin banco',
            valor: r.enjauladas_sin_banco,
          },
        ]
      : []),
    { clave: 'despachadas', nombre: 'Despachadas', valor: r.despachadas },
    {
      clave: 'con-nucleo',
      nombre: 'Descartadas en el parque (con núcleo)',
      valor: r.descartadas_con_nucleo,
    },
    {
      clave: 'sin-nucleo',
      nombre: 'Descartadas antes de introducir (sin núcleo)',
      valor: r.descartadas_sin_nucleo,
    },
    { clave: 'en-parque', nombre: 'Todavía en el parque', valor: r.en_parque },
  ]
}
