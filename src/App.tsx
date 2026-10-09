import { useState } from 'react'
import { GuiaDeEstiloPage } from '@/pages/GuiaDeEstiloPage'
import StatusPage from '@/pages/StatusPage'
import SubidaDocumentoPage from '@/pages/SubidaDocumentoPage'

// Navegación mínima mientras llega el layout con rutas del issue #4.
type Seccion = 'estado' | 'subida' | 'guia'

function App() {
  const [seccion, setSeccion] = useState<Seccion>('estado')

  return (
    <>
      <nav className="pestanas" aria-label="Secciones">
        <button
          aria-current={seccion === 'estado' ? 'page' : undefined}
          onClick={() => setSeccion('estado')}
        >
          Estado
        </button>
        <button
          aria-current={seccion === 'subida' ? 'page' : undefined}
          onClick={() => setSeccion('subida')}
        >
          Subir documento
        </button>
        <button
          aria-current={seccion === 'guia' ? 'page' : undefined}
          onClick={() => setSeccion('guia')}
        >
          Guía de estilo
        </button>
      </nav>
      {seccion === 'estado' ? <StatusPage /> : seccion === 'subida' ? <SubidaDocumentoPage /> : <GuiaDeEstiloPage />}
    </>
  )
}

export default App
