/** Un PDF de una página con líneas de texto, sin dependencias. Lo usa la
 *  demo con datos simulados para que "Abrir PDF" y "Descargar PDF" tengan
 *  algo que mostrar; el PDF real lo arma el backend desde el snapshot. */

const LINEAS_POR_PAGINA = 60
const LARGO_DE_LINEA = 95
const ALTO_DE_LINEA = 12
const MARGEN_SUPERIOR = 800
const MARGEN_IZQUIERDO = 50

/** Texto para un string literal de PDF con WinAnsi: los caracteres de
 *  Latin-1 (tildes, ñ) van como octal; el resto, como "?". */
export function textoPdf(texto: string): string {
  let salida = ''
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 63
    if (caracter === '\\' || caracter === '(' || caracter === ')')
      salida += `\\${caracter}`
    else if (codigo >= 32 && codigo < 127) salida += caracter
    else if (codigo >= 160 && codigo <= 255)
      salida += `\\${codigo.toString(8).padStart(3, '0')}`
    else salida += '?'
  }
  return salida
}

/** Corta una línea larga en pedazos que entran en el ancho de la página. */
function cortar(linea: string): string[] {
  if (linea.length <= LARGO_DE_LINEA) return [linea]
  const pedazos: string[] = []
  let actual = ''
  for (const palabra of linea.split(' ')) {
    const candidata = actual ? `${actual} ${palabra}` : palabra
    if (candidata.length > LARGO_DE_LINEA && actual) {
      pedazos.push(actual)
      actual = palabra
    } else actual = candidata
  }
  if (actual) pedazos.push(actual)
  return pedazos
}

/** El PDF completo como texto ASCII (los offsets del xref son de bytes). */
export function armarPdf(lineas: readonly string[]): string {
  const visibles = lineas
    .flatMap((l) => l.split('\n'))
    .flatMap(cortar)
    .slice(0, LINEAS_POR_PAGINA)
  const contenido = [
    'BT',
    '/F1 10 Tf',
    `${ALTO_DE_LINEA} TL`,
    `${MARGEN_IZQUIERDO} ${MARGEN_SUPERIOR} Td`,
    ...visibles.map((l) => `(${textoPdf(l)}) Tj T*`),
    'ET',
  ].join('\n')
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objetos.map((objeto, i) => {
    const desde = pdf.length
    pdf += `${i + 1} 0 obj\n${objeto}\nendobj\n`
    return desde
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`
  pdf += offsets
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}
