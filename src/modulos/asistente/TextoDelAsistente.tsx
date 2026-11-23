import { bloquesDelTexto } from '@/lib/asistente'

/** El texto del modelo como texto plano: párrafos con sus saltos de línea y
 *  listas simples, armados a mano. Nunca se interpreta como HTML (React
 *  escapa todo lo que va como children). */
export function TextoDelAsistente({ texto }: { texto: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-texto">
      {bloquesDelTexto(texto).map((bloque, i) => {
        if (bloque.tipo === 'parrafo')
          return (
            <p key={i} className="whitespace-pre-line break-words">
              {bloque.texto}
            </p>
          )
        const Lista = bloque.ordenada ? 'ol' : 'ul'
        return (
          <Lista
            key={i}
            className={
              bloque.ordenada
                ? 'list-decimal space-y-1 pl-5'
                : 'list-disc space-y-1 pl-5'
            }
          >
            {bloque.items.map((item, j) => (
              <li key={j} className="break-words">
                {item}
              </li>
            ))}
          </Lista>
        )
      })}
    </div>
  )
}
