import { useState } from 'react'
import StatusPage from './pages/StatusPage'
import SubidaDocumentoPage from './pages/SubidaDocumentoPage'

// Navegación mínima mientras llega el layout con rutas del issue #4.
type Seccion = 'estado' | 'subida'

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
      </nav>
      {seccion === 'estado' ? <StatusPage /> : <SubidaDocumentoPage />}
    </>
  )
}

export default App
