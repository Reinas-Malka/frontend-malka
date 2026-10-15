# Estructura de src/

| Carpeta                | Qué va                                                                 | Ejemplo                                  |
| ---------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `app/`                 | Armazón: router, layout con menú, navegación y el cliente de consultas | `router.tsx`, `navegacion.ts`            |
| `api/`                 | Todo lo que habla con el backend                                       | `client.ts`, `recurso.ts`, `recursos.ts` |
| `api/esquema.d.ts`     | **Generado** del OpenAPI del backend: no se edita a mano               | ver `contrato/README.md`                 |
| `components/ui/`       | Componentes base con todos sus estados (skill `diseno-frontend`)       | `Button`, `DataTable`, `Modal`           |
| `components/catalogo/` | La pantalla genérica de alta, edición, baja y búsqueda                 | `PaginaCatalogo`, `FormularioRecurso`    |
| `components/pagina/`   | Piezas comunes de toda pantalla                                        | `EncabezadoDePagina`                     |
| `modulos/<dominio>/`   | Configuración y lógica de cada dominio (producción, ventas…)           | `modulos/ventas/catalogos.tsx`           |
| `documentos/`          | Lógica de la subida de documentos                                      | `subirPorUrlPrefermada.ts`               |
| `pages/`               | Una pantalla por ruta, **solo composición**                            | `StatusPage`, `CatalogoPages`            |
| `hooks/`               | `use*` compartidos                                                     | `useListado`, `useMutacionesDe`          |
| `tipos/`               | Tipos del dominio (alias del esquema generado donde hay endpoint)      | `dominio.ts`                             |
| `types/`               | Tipos de documentos y health (se unifica con `tipos/` en el issue #29) | `documentos.ts`                          |
| `datos/`               | Datos simulados y lo que todavía no tiene endpoint                     | `simulados.ts`                           |
| `lib/`                 | Utilidades puras sin React                                             | `cuit.ts`, `utils.ts`                    |

## Cómo agregar…

**Un catálogo nuevo** (CRUD con la forma común del backend):

1. En `api/recursos.ts`: `export const cosas = elegir<Cosa, CosaCrear, CosaActualizar>('/api/v1/cosas', semilla, construir)`.
2. En `modulos/<dominio>/catalogos.tsx`: un `ConfigCatalogo` con columnas, campos y conversiones.
3. En `pages/CatalogoPages.tsx`: `export const CosasPage = () => <PaginaCatalogo config={catalogoCosas} />`.
4. En `app/router.tsx` y `app/navegacion.ts`: la ruta y el enlace.

No hace falta escribir la tabla, el formulario, los tres estados, la búsqueda ni la confirmación de baja: los pone `PaginaCatalogo`.

**Una pantalla que no es catálogo:** `useQuery` o `useMutation` contra `api/`, con `EncabezadoDePagina`, `Cargando`, `Vacio` y `ErrorDePantalla(describirError(error))`. El ejemplo es `pages/StatusPage.tsx`.

## Reglas

- Imports **siempre** con alias `@/...`, nunca relativos que suban de carpeta.
- Datos del servidor con TanStack Query, nunca con `useEffect` + `fetch`.
- Simulado o real se decide solo en `api/recursos.ts`, según `VITE_DATOS_SIMULADOS`. Con el flag, el banner es obligatorio.
- Si cambia el backend, se regenera el contrato (`contrato/README.md`): el build marca lo que hay que ajustar.
- Variables `VITE_*`: ver el issue #6 y el ADR 0011 del backend.
