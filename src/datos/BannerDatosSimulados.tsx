/** Banner fijo de datos de ejemplo: visible en TODA la app cuando el flag
 *  está activo. Apagado por defecto en producción. */
export function BannerDatosSimulados() {
  if (import.meta.env.VITE_DATOS_SIMULADOS !== 'true') return null
  return (
    <div
      role="status"
      className="sticky top-0 z-30 bg-aviso/90 px-4 py-1.5 text-center text-xs font-medium text-carbon-900"
    >
      ⚠ Datos de ejemplo — no es el sistema real
    </div>
  )
}
