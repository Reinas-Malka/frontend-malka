/** Catálogos de producción (backend #30). Cada uno es solo configuración:
 *  la pantalla es components/catalogo/PaginaCatalogo. */
import { Link } from 'react-router'
import type { components } from '@/api/esquema'
import {
  bancos,
  madres,
  materiales,
  nucleos,
  parques,
  razas,
} from '@/api/recursos'
import type { ConfigCatalogo } from '@/components/catalogo/PaginaCatalogo'
import type {
  Banco,
  Madre,
  Material,
  Nucleo,
  Parque,
  Raza,
} from '@/tipos/dominio'

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
  rolesEscritura: ['admin', 'produccion'],
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
  rolesEscritura: ['admin', 'produccion'],
}

export const catalogoParques: ConfigCatalogo<
  Parque,
  Esquemas['ParqueCrear'],
  Esquemas['ParqueActualizar']
> = {
  clave: 'parques',
  titulo: 'Parques de fecundación',
  descripcion:
    'Donde cada celda entra a un núcleo para fecundarse. No confundir con el banco, que guarda las reinas ya enjauladas.',
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
  rolesEscritura: ['admin', 'produccion'],
}

// Confirmada por la clienta el 16/10; igual que el default del backend.
const CAPACIDAD_BANCO_POR_DEFECTO = 276

export const catalogoBancos: ConfigCatalogo<
  Banco,
  Esquemas['BancoCrear'],
  Esquemas['BancoActualizar']
> = {
  clave: 'bancos',
  titulo: 'Bancos',
  descripcion:
    'Donde se guardan las reinas ya enjauladas, listas para despacho. No confundir con el parque de fecundación.',
  singular: 'banco',
  recurso: bancos,
  columnas: [
    {
      clave: 'identificador',
      titulo: 'Identificador',
      orden: (a, b) => a.identificador.localeCompare(b.identificador),
    },
    {
      clave: 'reinas_en_banco',
      titulo: 'Reinas',
      render: (b) => `${b.reinas_en_banco} / ${b.capacidad_max}`,
      orden: (a, b) => a.reinas_en_banco - b.reinas_en_banco,
    },
  ],
  campos: [
    {
      nombre: 'identificador',
      etiqueta: 'Identificador',
      requerido: true,
      max: 50,
      placeholder: 'B-01',
    },
    {
      nombre: 'capacidad_max',
      etiqueta: 'Capacidad (reinas)',
      tipo: 'numero',
      requerido: true,
      min: 1,
      max: MAX_CAPACIDAD,
      validar: (v) =>
        Number.isInteger(Number(v))
          ? null
          : 'La capacidad es un número entero de reinas.',
    },
  ],
  valoresIniciales: {
    identificador: '',
    capacidad_max: String(CAPACIDAD_BANCO_POR_DEFECTO),
  },
  nombreDeFila: (b) => b.identificador,
  valoresDeFila: (b) => ({
    identificador: b.identificador,
    capacidad_max: String(b.capacidad_max),
  }),
  aCrear: (v) => ({
    identificador: v.identificador.trim(),
    capacidad_max: Number(v.capacidad_max),
  }),
  aActualizar: (v) => ({
    identificador: v.identificador.trim(),
    capacidad_max: Number(v.capacidad_max),
  }),
  reactivacion: { activo: true },
  rolesEscritura: ['admin', 'produccion'],
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
      // Lleva a sus movimientos: compras, consumos y ajustes.
      render: (m) => (
        <Link
          to={`/produccion/materiales/${m.id}`}
          className="font-medium text-miel-300 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-acento"
        >
          {m.nombre}
        </Link>
      ),
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
  rolesEscritura: ['admin', 'produccion'],
}

// Tope de fila y posición de app/schemas/produccion.py (MAXIMO_UBICACION).
const MAX_UBICACION = 1000

/** Núcleos (baby nucs) de los parques (backend #29). La configuración se arma
 *  con los parques ya cargados, para el selector. Un núcleo es un baby nuc
 *  (dominio, 23/10): la introducción reparte entre los activos del parque. */
export function catalogoNucleos(
  listaDeParques: readonly Parque[],
): ConfigCatalogo<
  Nucleo,
  Esquemas['NucleoCrear'],
  Esquemas['NucleoActualizar']
> {
  const nombreDeParque = (id: string) =>
    listaDeParques.find((p) => p.id === id)?.nombre ?? 'Parque dado de baja'
  const ubicacion = (n: Nucleo) =>
    `${nombreDeParque(n.parque_id)} · fila ${n.fila}, posición ${n.posicion}`
  return {
    clave: 'nucleos',
    titulo: 'Núcleos',
    descripcion:
      'Los baby nucs de cada parque, por fila y posición. Al introducir celdas, el sistema reparte entre los activos.',
    singular: 'núcleo',
    recurso: nucleos,
    columnas: [
      {
        clave: 'parque_id',
        titulo: 'Parque',
        render: (n) => nombreDeParque(n.parque_id),
        orden: (a, b) =>
          nombreDeParque(a.parque_id).localeCompare(
            nombreDeParque(b.parque_id),
          ),
      },
      {
        clave: 'fila',
        titulo: 'Fila',
        orden: (a, b) => a.fila - b.fila || a.posicion - b.posicion,
      },
      { clave: 'posicion', titulo: 'Posición' },
    ],
    campos: [
      {
        nombre: 'parque_id',
        etiqueta: 'Parque',
        tipo: 'seleccion',
        requerido: true,
        opciones: () =>
          listaDeParques
            .filter((p) => p.activo)
            .map((p) => ({ valor: p.id, etiqueta: p.nombre })),
        // El parque se elige al crear: el backend no deja cambiarlo.
        visible: (v) => v.modo !== 'edicion',
      },
      {
        nombre: 'fila',
        etiqueta: 'Fila',
        tipo: 'numero',
        requerido: true,
        min: 1,
        max: MAX_UBICACION,
      },
      {
        nombre: 'posicion',
        etiqueta: 'Posición',
        tipo: 'numero',
        requerido: true,
        min: 1,
        max: MAX_UBICACION,
      },
    ],
    nombreDeFila: ubicacion,
    textoDeBusqueda: ubicacion,
    valoresDeFila: (n) => ({
      modo: 'edicion',
      parque_id: n.parque_id,
      fila: String(n.fila),
      posicion: String(n.posicion),
    }),
    aCrear: (v) => ({
      parque_id: v.parque_id,
      fila: Number(v.fila),
      posicion: Number(v.posicion),
    }),
    aActualizar: (v) => ({
      fila: Number(v.fila),
      posicion: Number(v.posicion),
    }),
    reactivacion: { activo: true },
    rolesEscritura: ['admin', 'produccion'],
  }
}
