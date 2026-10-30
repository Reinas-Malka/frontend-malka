import {
  ClipboardList,
  Dna,
  Gauge,
  Grid3x3,
  Layers,
  Package,
  Plane,
  Tag,
  Trees,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

import { puede, ROLES, type Identidad, type Rol } from '@/auth/identidad'

export type Enlace = { a: string; texto: string; icono: LucideIcon }
export type Grupo = { titulo: string; enlaces: Enlace[] }

/** Qué roles abren cada sección (#4): el menú esconde lo demás y el layout
 *  no lo muestra aunque se escriba la URL. Por prefijo, así cubre también
 *  las rutas que no están en el menú (madres, el detalle de un embarque).
 *  Gana el prefijo más largo; una ruta sin prefijo acá la abre cualquier rol.
 *
 *  Es comodidad de UI: el que decide es el backend (require_role → 403). */
export const ACCESOS: readonly { prefijo: string; roles: readonly Rol[] }[] = [
  { prefijo: '/produccion', roles: ['admin', 'produccion', 'lectura'] },
  { prefijo: '/ventas', roles: ['admin', 'ventas', 'lectura'] },
  // Los carga producción y los usa ventas para cotizar.
  { prefijo: '/ventas/items-vendibles', roles: ROLES },
  { prefijo: '/exportacion', roles: ['admin', 'ventas', 'lectura'] },
  // Solo quien puede pedir la subida (POST /documentos/subidas).
  { prefijo: '/documentos', roles: ['admin', 'ventas'] },
  { prefijo: '/guia-de-estilo', roles: ['admin'] },
  { prefijo: '/estado', roles: ['admin'] },
]

function rolesPara(ruta: string): readonly Rol[] {
  const coincidencias = ACCESOS.filter(
    ({ prefijo }) => ruta === prefijo || ruta.startsWith(`${prefijo}/`),
  )
  const masLarga = coincidencias.sort(
    (a, b) => b.prefijo.length - a.prefijo.length,
  )[0]
  return masLarga?.roles ?? ROLES
}

/** ¿Esta persona puede abrir esta ruta? Sin sesión o sin rol, ninguna. */
export function puedeAbrir(identidad: Identidad | null, ruta: string): boolean {
  return puede(identidad, rolesPara(ruta))
}

/** Menú lateral. Un solo lugar: el router y el layout leen de acá.
 *  Solo lo que usa el criadero: la guía de estilo y la subida suelta de
 *  documentos tienen ruta pero no enlace (la carga real va en cada embarque). */
export const NAVEGACION: Grupo[] = [
  {
    titulo: 'Producción',
    enlaces: [
      { a: '/produccion/tandas', texto: 'Tandas', icono: Layers },
      { a: '/produccion/razas', texto: 'Razas', icono: Dna },
      { a: '/produccion/parques', texto: 'Parques', icono: Trees },
      { a: '/produccion/nucleos', texto: 'Núcleos', icono: Grid3x3 },
      { a: '/produccion/bancos', texto: 'Bancos', icono: Warehouse },
      { a: '/produccion/materiales', texto: 'Materiales', icono: Package },
    ],
  },
  {
    titulo: 'Ventas',
    enlaces: [
      { a: '/ventas/pedidos', texto: 'Pedidos', icono: ClipboardList },
      { a: '/ventas/clientes', texto: 'Clientes', icono: Users },
      { a: '/ventas/items-vendibles', texto: 'Ítems vendibles', icono: Tag },
    ],
  },
  {
    titulo: 'Exportación',
    enlaces: [
      { a: '/exportacion/embarques', texto: 'Embarques', icono: Plane },
    ],
  },
  {
    titulo: 'Equipo',
    enlaces: [{ a: '/estado', texto: 'Estado del sistema', icono: Gauge }],
  },
]

/** Adónde lleva el inicio: la primera sección del menú que el rol abre.
 *  null sin sesión o sin rol (el layout muestra el aviso). */
export function primerDestino(identidad: Identidad | null): string | null {
  const enlace = NAVEGACION.flatMap((grupo) => grupo.enlaces).find(({ a }) =>
    puedeAbrir(identidad, a),
  )
  return enlace?.a ?? null
}
