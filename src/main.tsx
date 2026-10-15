import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { crearClienteDeConsultas } from '@/app/consultas'
import { router } from '@/app/router'
import './index.css'

const clienteDeConsultas = crearClienteDeConsultas()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteDeConsultas}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
