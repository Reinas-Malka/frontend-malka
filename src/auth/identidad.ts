/** Quién está usando la app, leído del ID token de Cognito. Los nombres de
 *  los claims son los que valida el backend (app/auth.py). */

export const ROLES = ['admin', 'produccion', 'ventas', 'lectura'] as const
export type Rol = (typeof ROLES)[number]

export type Identidad = { email: string; roles: Rol[]; tenantId: string }

const esRol = (valor: unknown): valor is Rol => ROLES.includes(valor as Rol)

export function identidadDesdePerfil(
  perfil: Record<string, unknown>,
): Identidad {
  const grupos = perfil['cognito:groups']
  return {
    email: String(perfil.email ?? ''),
    // Un grupo que no es rol del sistema se ignora: no da permisos.
    roles: Array.isArray(grupos) ? grupos.filter(esRol) : [],
    tenantId: String(perfil['custom:tenant_id'] ?? ''),
  }
}

/** ¿Tiene alguno de estos roles? La UI solo esconde lo que no corresponde:
 *  el que decide es el backend (require_role → 403). */
export function puede(
  identidad: Identidad | null,
  roles: readonly Rol[],
): boolean {
  return (
    identidad !== null && identidad.roles.some((rol) => roles.includes(rol))
  )
}

export const NOMBRE_DE_ROL: Record<Rol, string> = {
  admin: 'Administración',
  produccion: 'Producción',
  ventas: 'Ventas',
  lectura: 'Solo lectura',
}
