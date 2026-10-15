/** Las pantallas de catálogo, cada una = PaginaCatalogo + su configuración.
 *  Viven en un módulo aparte para que el router las cargue bajo demanda. */
import { PaginaCatalogo } from '@/components/catalogo/PaginaCatalogo'
import {
  catalogoMadres,
  catalogoMateriales,
  catalogoParques,
  catalogoRazas,
} from '@/modulos/produccion/catalogos'
import {
  catalogoClientes,
  catalogoItemsVendibles,
} from '@/modulos/ventas/catalogos'

export const RazasPage = () => <PaginaCatalogo config={catalogoRazas} />
export const MadresPage = () => <PaginaCatalogo config={catalogoMadres} />
export const ParquesPage = () => <PaginaCatalogo config={catalogoParques} />
export const MaterialesPage = () => (
  <PaginaCatalogo config={catalogoMateriales} />
)
export const ClientesPage = () => <PaginaCatalogo config={catalogoClientes} />
export const ItemsVendiblesPage = () => (
  <PaginaCatalogo config={catalogoItemsVendibles} />
)
