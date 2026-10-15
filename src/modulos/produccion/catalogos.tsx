/** Catálogos de producción (backend #30). Cada uno es solo configuración:
 *  la pantalla es components/catalogo/PaginaCatalogo. */
import type { components } from '@/api/esquema'
import { madres, materiales, parques, razas } from '@/api/recursos'
import type { ConfigCatalogo } from '@/components/catalogo/PaginaCatalogo'
import type { Madre, Material, Parque, Raza } from '@/tipos/dominio'

type Esquemas = components['schemas']

// Topes de app/schemas/produccion.py.
const MAX_NOMBRE = 100
const MAX_CAPACIDAD = 10_000

export const catalogoRazas: ConfigCatalogo<
  Raza,
  Esquemas['RazaCrear'],
  Esquemas['RazaActualizar']
> = {
  clave: 'razas',
  titulo: 'Razas',
  descripcion: 'Las razas son datos de cada criadero: no hay una lista fija.',
  singular: 'raza',
  femenino: true,
  recurso: razas,
  columnas: [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: (a, b) => a.nombre.localeCompare(b.nombre),
    },
    {
      clave: 'descripcion',
      titulo: 'Descripción',
      render: (r) => r.descripcion ?? '—',
    },
  ],
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, max: MAX_NOMBRE },
    {
      nombre: 'descripcion',
      etiqueta: 'Descripción',
      tipo: 'texto-largo',
      max: 500,
    },
  ],
  nombreDeFila: (r) => r.nombre,
  valoresDeFila: (r) => ({
    nombre: r.nombre,
    descripcion: r.descripcion ?? '',
  }),
  aCrear: (v) => ({
    nombre: v.nombre.trim(),
    descripcion: v.descripcion?.trim() || null,
  }),
  aActualizar: (v) => ({
    nombre: v.nombre.trim(),
    descripcion: v.descripcion?.trim() || null,
  }),
  reactivacion: { activo: true },
}

export const catalogoMadres: ConfigCatalogo<
  Madre,
  Esquemas['MadreCrear'],
  Esquemas['MadreActualizar']
> = {
  clave: 'madres',
  titulo: 'Madres',
  descripcion: 'Reinas madre de las que salen las larvas de cada tanda.',
  singular: 'madre',
  femenino: true,
  recurso: madres,
  columnas: [
    {
      clave: 'identificacion',
      titulo: 'Identificación',
      orden: (a, b) => a.identificacion.localeCompare(b.identificacion),
    },
  ],
  campos: [
    {
      nombre: 'identificacion',
      etiqueta: 'Identificación',
      requerido: true,
      max: 50,
      placeholder: 'A-12',
    },
  ],
  nombreDeFila: (m) => m.identificacion,
  valoresDeFila: (m) => ({ identificacion: m.identificacion }),
  aCrear: (v) => ({ identificacion: v.identificacion.trim() }),
  aActualizar: (v) => ({ identificacion: v.identificacion.trim() }),
  reactivacion: { activo: true },
}

export const catalogoParques: ConfigCatalogo<
  Parque,
  Esquemas['ParqueCrear'],
  Esquemas['ParqueActualizar']
> = {
  clave: 'parques',
  titulo: 'Parques de fecundación',
  descripcion:
    'Donde cada celda entra a un núcleo. No confundir con el banco de reinas.',
  singular: 'parque',
  recurso: parques,
  columnas: [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: (a, b) => a.nombre.localeCompare(b.nombre),
    },
    { clave: 'ubicacion', titulo: 'Ubicación' },
    {
      clave: 'nucleos_activos',
      titulo: 'Núcleos',
      render: (p) => `${p.nucleos_activos} / ${p.capacidad_max}`,
      orden: (a, b) => a.nucleos_activos - b.nucleos_activos,
    },
  ],
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, max: MAX_NOMBRE },
    {
      nombre: 'ubicacion',
      etiqueta: 'Ubicación',
      requerido: true,
      max: 200,
      ayuda: 'Texto libre: predio, camino, referencia.',
    },
    {
      nombre: 'capacidad_max',
      etiqueta: 'Capacidad (núcleos)',
      tipo: 'numero',
      requerido: true,
      min: 1,
      max: MAX_CAPACIDAD,
      validar: (v) =>
        Number.isInteger(Number(v))
          ? null
          : 'La capacidad es un número entero de núcleos.',
    },
  ],
  nombreDeFila: (p) => p.nombre,
  valoresDeFila: (p) => ({
    nombre: p.nombre,
    ubicacion: p.ubicacion,
    capacidad_max: String(p.capacidad_max),
  }),
  aCrear: (v) => ({
    nombre: v.nombre.trim(),
    ubicacion: v.ubicacion.trim(),
    capacidad_max: Number(v.capacidad_max),
  }),
  aActualizar: (v) => ({
    nombre: v.nombre.trim(),
    ubicacion: v.ubicacion.trim(),
    capacidad_max: Number(v.capacidad_max),
  }),
  reactivacion: { activo: true },
}

export const catalogoMateriales: ConfigCatalogo<
  Material,
  Esquemas['MaterialCrear'],
  Esquemas['MaterialActualizar']
> = {
  clave: 'materiales',
  titulo: 'Materiales',
  descripcion:
    'El stock no se guarda: es la suma de compras, consumos y ajustes.',
  singular: 'material',
  recurso: materiales,
  columnas: [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: (a, b) => a.nombre.localeCompare(b.nombre),
    },
    {
      clave: 'stock',
      titulo: 'Stock',
      render: (m) => `${Number(m.stock).toLocaleString('es-AR')} ${m.unidad}`,
      orden: (a, b) => Number(a.stock) - Number(b.stock),
    },
  ],
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, max: MAX_NOMBRE },
    {
      nombre: 'unidad',
      etiqueta: 'Unidad',
      requerido: true,
      max: 20,
      placeholder: 'cúpulas',
    },
  ],
  nombreDeFila: (m) => m.nombre,
  valoresDeFila: (m) => ({ nombre: m.nombre, unidad: m.unidad }),
  aCrear: (v) => ({ nombre: v.nombre.trim(), unidad: v.unidad.trim() }),
  aActualizar: (v) => ({ nombre: v.nombre.trim(), unidad: v.unidad.trim() }),
  reactivacion: { activo: true },
}
