import {
  ClipboardList,
  Dna,
  Gauge,
  Grid3x3,
  Package,
  Palette,
  Plane,
  Tag,
  Trees,
  Upload,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'

export type Enlace = { a: string; texto: string; icono: LucideIcon }
export type Grupo = { titulo: string; enlaces: Enlace[] }

/** Menú lateral. Un solo lugar: el router y el layout leen de acá.
 *  Los roles por enlace (#4) se agregan cuando exista la sesión (#6). */
export const NAVEGACION: Grupo[] = [
  {
    titulo: 'General',
    enlaces: [{ a: '/', texto: 'Estado del sistema', icono: Gauge }],
  },
  {
    titulo: 'Producción',
    enlaces: [
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
    titulo: 'Documentos',
    enlaces: [
      { a: '/documentos/subir', texto: 'Subir documento', icono: Upload },
    ],
  },
  {
    titulo: 'Equipo',
    enlaces: [
      { a: '/guia-de-estilo', texto: 'Guía de estilo', icono: Palette },
    ],
  },
]
