/** Busca el código QR de ARCA en el PDF de una factura y devuelve su texto
 *  (la URL), o null si no lo encuentra. Renderiza la primera página (y la
 *  segunda si no aparece) con pdf.js en un canvas y lo busca con jsQR.
 *
 *  Las dos librerías pesan: se cargan con import() recién cuando la persona
 *  elige el PDF en el alta, así no entran en el bundle inicial.
 *
 *  CSP de producción (infra/frontend.tf del backend): script-src 'self',
 *  sin worker-src (cae en script-src) ni 'wasm-unsafe-eval'. Por eso:
 *  - el worker sale del mismo origen: Vite lo copia como asset (?url);
 *  - useWasm: false, así pdf.js no compila WebAssembly (los decodificadores
 *    en JS alcanzan para la imagen del QR);
 *  - pdf.js 6 ya no usa eval ni new Function (la opción isEvalSupported de
 *    versiones anteriores se quitó): no hace falta 'unsafe-eval';
 *  - los bytes se pasan en memoria (data), sin fetch ni URLs blob:. */

/** Puntos de PDF → píxeles: a 3x (216 ppp) el QR de ARCA, de unos 3 cm,
 *  queda con módulos de 3 o 4 píxeles, que jsQR lee bien. */
const ESCALA = 3
/** El QR va al pie de la factura: alcanza con las dos primeras páginas. */
const PAGINAS_A_REVISAR = 2

export async function leerQrDelPdf(pdf: File): Promise<string | null> {
  const [pdfjs, { default: jsQR }, { default: urlDelWorker }] =
    await Promise.all([
      import('pdfjs-dist'),
      import('jsqr'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ])
  pdfjs.GlobalWorkerOptions.workerSrc = urlDelWorker

  const tarea = pdfjs.getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
    useWasm: false,
    // Sin cMapUrl ni standardFontDataUrl: no se baja nada más (el QR es una
    // imagen; si falta una fuente, el texto sale con otra y no importa).
  })
  try {
    const documento = await tarea.promise
    const paginas = Math.min(documento.numPages, PAGINAS_A_REVISAR)
    for (let numero = 1; numero <= paginas; numero++) {
      const pagina = await documento.getPage(numero)
      const vista = pagina.getViewport({ scale: ESCALA })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(vista.width)
      canvas.height = Math.ceil(vista.height)
      const contexto = canvas.getContext('2d', { willReadFrequently: true })
      if (!contexto) return null
      await pagina.render({ canvas, canvasContext: contexto, viewport: vista })
        .promise
      const imagen = contexto.getImageData(0, 0, canvas.width, canvas.height)
      pagina.cleanup()
      const qr = jsQR(imagen.data, imagen.width, imagen.height, {
        // Un PDF de ARCA es negro sobre blanco: no hace falta probar invertido.
        inversionAttempts: 'dontInvert',
      })
      if (qr?.data) return qr.data
    }
    return null
  } finally {
    await tarea.destroy()
  }
}
