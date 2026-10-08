# Estructura de src/

- `api/` — llamadas HTTP (un archivo por recurso del backend). El formato único de errores vive en `api/client.ts`.
- `pages/` — una página por ruta. Solo composición; la lógica va a `hooks/` o al módulo.
- `components/` — componentes reutilizables sin conocimiento de rutas ni datos globales.
- `documentos/`, `auth/`, … — un módulo por dominio: su lógica y tipos internos.
- `hooks/` — `use*` compartidos (estado, efectos, contexto).
- `lib/` — utilidades puras sin React.
- `types/` — tipos compartidos entre módulos.

Convenciones: imports SIEMPRE con alias `@/...` (nunco relativos que suban de carpeta). Las variables `VITE_*` y su contrato: ver el issue #6 y el ADR 0011 del backend.
