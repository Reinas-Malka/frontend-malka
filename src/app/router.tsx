import type { ComponentType } from 'react'
import { createBrowserRouter, type RouteObject } from 'react-router'
import { AppLayout } from '@/app/AppLayout'
import { RUTA_CALLBACK } from '@/auth/config'
import { RutaPrivada } from '@/auth/RutaPrivada'
import { CallbackPage } from '@/pages/CallbackPage'
import { LoginPage } from '@/pages/LoginPage'
import { CargaInicial, ErrorDeRuta } from '@/app/ErrorDeRuta'
import { NoEncontradaPage } from '@/pages/NoEncontradaPage'
import StatusPage from '@/pages/StatusPage'

/** Carga diferida: cada pantalla baja su código recién al abrirla (el
 *  bundle inicial queda bajo el umbral de 500 kB de la skill de diseño). */
const catalogo =
  (nombre: keyof typeof import('@/pages/CatalogoPages')) => async () => ({
    Component: (await import('@/pages/CatalogoPages'))[nombre] as ComponentType,
  })

/** Rutas de la app. CloudFront devuelve index.html en 403/404
 *  (infra/frontend.tf del backend), así que las rutas profundas funcionan. */
export const rutas: RouteObject[] = [
  // Públicas: el ingreso y la vuelta de Cognito (#6).
  { path: '/login', element: <LoginPage /> },
  { path: RUTA_CALLBACK, element: <CallbackPage /> },
  {
    path: '/',
    // Todo lo demás pide sesión; sin ella, al login recordando la pantalla.
    element: <RutaPrivada />,
    errorElement: <ErrorDeRuta />,
    hydrateFallbackElement: <CargaInicial />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <StatusPage /> },
          { path: 'produccion/razas', lazy: catalogo('RazasPage') },
          { path: 'produccion/madres', lazy: catalogo('MadresPage') },
          { path: 'produccion/parques', lazy: catalogo('ParquesPage') },
          { path: 'produccion/materiales', lazy: catalogo('MaterialesPage') },
          { path: 'ventas/clientes', lazy: catalogo('ClientesPage') },
          {
            path: 'ventas/items-vendibles',
            lazy: catalogo('ItemsVendiblesPage'),
          },
          {
            path: 'documentos/subir',
            lazy: async () => ({
              Component: (await import('@/pages/SubidaDocumentoPage')).default,
            }),
          },
          {
            path: 'guia-de-estilo',
            lazy: async () => ({
              Component: (await import('@/pages/GuiaDeEstiloPage'))
                .GuiaDeEstiloPage,
            }),
          },
          { path: '*', element: <NoEncontradaPage /> },
        ],
      },
    ],
  },
]

export const router = createBrowserRouter(rutas)
