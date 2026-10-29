/** Catálogos de ventas: ítems vendibles (backend #30) y clientes (#32). */
import type { components } from '@/api/esquema'
import { clientes, itemsVendibles } from '@/api/recursos'
import type { Opcion, Valores } from '@/components/catalogo/campos'
import type { ConfigCatalogo } from '@/components/catalogo/PaginaCatalogo'
import { Badge } from '@/components/ui/badge'
import { esCuitValido, normalizarCuit } from '@/lib/cuit'
import { PAISES_EXTRANJEROS, PAIS_LOCAL, nombreDePais } from '@/lib/paises'
import type {
  Alicuota,
  Cliente,
  CondicionIva,
  ItemVendible,
} from '@/tipos/dominio'

type Esquemas = components['schemas']

const ALICUOTAS: Opcion[] = [
  { valor: '0.21', etiqueta: '21 %' },
  { valor: '0.105', etiqueta: '10,5 %' },
  { valor: '0.27', etiqueta: '27 %' },
  { valor: '0.05', etiqueta: '5 %' },
  { valor: '0.025', etiqueta: '2,5 %' },
  { valor: '0', etiqueta: '0 % / exento' },
]
/** El backend puede devolver 0.210 (Numeric): se compara por valor. */
const etiquetaAlicuota = (a: Alicuota) =>
  ALICUOTAS.find((o) => Number(o.valor) === Number(a))?.etiqueta ?? a

export const catalogoItemsVendibles: ConfigCatalogo<
  ItemVendible,
  Esquemas['ItemVendibleCrear'],
  Esquemas['ItemVendibleActualizar']
> = {
  clave: 'items-vendibles',
  titulo: 'Ítems vendibles',
  descripcion:
    'Qué se vende y con qué alícuota de IVA. La raza se elige en cada línea del pedido.',
  singular: 'ítem',
  recurso: itemsVendibles,
  columnas: [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: (a, b) => a.nombre.localeCompare(b.nombre),
    },
    {
      clave: 'alicuota',
      titulo: 'IVA',
      render: (i) => etiquetaAlicuota(i.alicuota),
    },
  ],
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, max: 100 },
    {
      nombre: 'alicuota',
      etiqueta: 'Alícuota de IVA',
      tipo: 'seleccion',
      requerido: true,
      opciones: () => ALICUOTAS,
    },
  ],
  valoresIniciales: { nombre: '', alicuota: '0.21' },
  nombreDeFila: (i) => i.nombre,
  valoresDeFila: (i) => ({
    nombre: i.nombre,
    alicuota:
      ALICUOTAS.find((o) => Number(o.valor) === Number(i.alicuota))?.valor ??
      '',
  }),
  aCrear: (v) => ({ nombre: v.nombre.trim(), alicuota: v.alicuota }),
  aActualizar: (v) => ({ nombre: v.nombre.trim(), alicuota: v.alicuota }),
  reactivacion: { activo: true },
  rolesEscritura: ['admin', 'produccion'],
}

const CONDICIONES_NACIONALES: Opcion[] = [
  {
    valor: 'responsable_inscripto',
    etiqueta: 'Responsable inscripto (Factura A)',
  },
  { valor: 'monotributo', etiqueta: 'Monotributo (Factura B)' },
  { valor: 'exento', etiqueta: 'Exento (Factura B)' },
  { valor: 'consumidor_final', etiqueta: 'Consumidor final (Factura B)' },
]

const PAISES: Opcion[] = PAISES_EXTRANJEROS.map((p) => ({
  valor: p.codigo,
  etiqueta: p.nombre,
}))

const esExportacion = (v: Valores) => v.tipo === 'exportacion'

/** Las reglas de ClienteCrear.validar_segun_tipo, del lado del formulario:
 *  nacional ⇒ AR + CUIT válido; exportación ⇒ otro país + cliente_exterior. */
function aClienteCrear(v: Valores): Esquemas['ClienteCrear'] {
  const exportacion = esExportacion(v)
  return {
    nombre: v.nombre.trim(),
    tipo: exportacion ? 'exportacion' : 'nacional',
    pais: exportacion ? v.pais : PAIS_LOCAL,
    condicion_iva: (exportacion
      ? 'cliente_exterior'
      : v.condicion_iva) as CondicionIva,
    cuit_o_tax_id: exportacion
      ? v.cuit_o_tax_id.trim()
      : normalizarCuit(v.cuit_o_tax_id),
  }
}

const LETRA: Record<Cliente['tipo_documento_por_defecto'], string> = {
  factura_a: 'A',
  factura_b: 'B',
  factura_e: 'E',
}

export const catalogoClientes: ConfigCatalogo<
  Cliente,
  Esquemas['ClienteCrear'],
  Esquemas['ClienteActualizar']
> = {
  clave: 'clientes',
  titulo: 'Clientes',
  descripcion:
    'Nacionales (con CUIT) y de exportación. La letra de la factura la asigna ARCA: acá solo se sugiere.',
  singular: 'cliente',
  recurso: clientes,
  columnas: [
    {
      clave: 'nombre',
      titulo: 'Nombre',
      orden: (a, b) => a.nombre.localeCompare(b.nombre),
    },
    {
      clave: 'tipo',
      titulo: 'Tipo',
      render: (c) => (
        <Badge tono={c.tipo === 'exportacion' ? 'miel' : 'neutro'}>
          {c.tipo === 'exportacion'
            ? `Exportación · ${nombreDePais(c.pais)}`
            : 'Nacional'}
        </Badge>
      ),
    },
    { clave: 'cuit_o_tax_id', titulo: 'CUIT / Tax ID' },
    {
      clave: 'tipo_documento_por_defecto',
      titulo: 'Factura sugerida',
      render: (c) => LETRA[c.tipo_documento_por_defecto],
    },
  ],
  campos: [
    {
      nombre: 'nombre',
      etiqueta: 'Nombre o razón social',
      requerido: true,
      max: 200,
    },
    {
      nombre: 'tipo',
      etiqueta: 'Tipo de cliente',
      tipo: 'seleccion',
      requerido: true,
      ayuda: 'Si el cliente ya tiene pedidos, no puede cambiar de tipo.',
      // El 409 del backend se muestra acá, no arriba del formulario.
      codigosDeError: ['cliente_con_pedidos'],
      opciones: () => [
        { valor: 'nacional', etiqueta: 'Nacional' },
        { valor: 'exportacion', etiqueta: 'Exportación' },
      ],
    },
    {
      nombre: 'pais',
      etiqueta: 'País',
      tipo: 'seleccion',
      requerido: true,
      visible: esExportacion,
      placeholder: 'Elegí el país',
      // Las opciones no incluyen AR: no hace falta validarlo aparte.
      opciones: () => PAISES,
    },
    {
      nombre: 'condicion_iva',
      etiqueta: 'Condición frente al IVA',
      tipo: 'seleccion',
      requerido: true,
      // En exportación la condición es siempre cliente_exterior: no se pregunta.
      visible: (v) => !esExportacion(v),
      opciones: () => CONDICIONES_NACIONALES,
    },
    {
      nombre: 'cuit_o_tax_id',
      etiqueta: 'CUIT o Tax ID',
      requerido: true,
      max: 50,
      ayuda:
        'Nacional: CUIT de 11 dígitos (con o sin guiones). Exportación: el identificador fiscal del país.',
      validar: (v, valores) =>
        esExportacion(valores) || esCuitValido(v)
          ? null
          : 'El CUIT no es válido.',
    },
  ],
  valoresIniciales: {
    nombre: '',
    tipo: 'nacional',
    pais: '',
    condicion_iva: '',
    cuit_o_tax_id: '',
  },
  nombreDeFila: (c) => c.nombre,
  // El CUIT se guarda sin guiones: se busca en las dos formas.
  textoDeBusqueda: (c) =>
    `${c.nombre} ${c.cuit_o_tax_id} ${c.cuit_o_tax_id.replace(/^(\d{2})(\d{8})(\d)$/, '$1-$2-$3')} ${nombreDePais(c.pais)}`,
  // Lo que no aplica al tipo guardado arranca vacío: si se cambia de tipo,
  // se elige de nuevo en vez de heredar AR o cliente_exterior.
  valoresDeFila: (c) => ({
    nombre: c.nombre,
    tipo: c.tipo,
    pais: c.tipo === 'exportacion' ? c.pais : '',
    condicion_iva: c.tipo === 'nacional' ? c.condicion_iva : '',
    cuit_o_tax_id: c.cuit_o_tax_id,
  }),
  aCrear: aClienteCrear,
  aActualizar: aClienteCrear,
  reactivacion: { activo: true },
  rolesEscritura: ['admin', 'ventas'],
}
