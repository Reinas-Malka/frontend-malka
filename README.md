# frontend-malka

Aplicación web de **Malka Suite**, el sistema de gestión para la cabaña apícola Malka.

Por ahora el proyecto contiene la base técnica y una pantalla de estado que consulta
el endpoint de salud del backend. Las pantallas de producción, ventas y documentos se
construyen sobre esta base.

Backend e infraestructura: [Reinas-Malka/backend-malka](https://github.com/Reinas-Malka/backend-malka)

## Stack

- [React 19](https://react.dev/) con [TypeScript](https://www.typescriptlang.org/) en modo `strict`
- [Vite](https://vite.dev/) como servidor de desarrollo y empaquetador
- [ESLint](https://eslint.org/) y [Prettier](https://prettier.io/) para calidad y formato de código

## Requisitos

- [Node.js](https://nodejs.org/) 20.19 o superior (se recomienda la última versión LTS)
- npm, que viene incluido con Node.js

## Cómo levantar el proyecto en local

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/Reinas-Malka/frontend-malka.git
   cd frontend-malka
   ```

2. Instalar las dependencias:

   ```bash
   npm ci
   ```

3. Crear el archivo `.env` a partir del ejemplo:

   ```bash
   # Linux / macOS / Git Bash
   cp .env.example .env

   # Windows (CMD o PowerShell)
   copy .env.example .env
   ```

4. Completar en `.env` la URL pública de la API (ver [Variables de entorno](#variables-de-entorno)).

5. Levantar el servidor de desarrollo:

   ```bash
   npm run dev
   ```

6. Abrir [http://localhost:5173](http://localhost:5173) en el navegador.

> Vite lee el archivo `.env` solo al arrancar. Si lo modificás con el servidor
> corriendo, hay que detenerlo (`Ctrl + C`) y volver a ejecutar `npm run dev`.

## Variables de entorno

| Variable                   | Descripción                                                                                          | Ejemplo                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `VITE_API_BASE_URL`        | URL base de la API, sin barra al final                                                               | `https://xxxxxxxx.execute-api.us-east-1.amazonaws.com` |
| `VITE_URL_SUBIDA_FICTICIA` | Solo desarrollo: URL prefirmada de S3 generada a mano, para probar la subida sin backend (issue #15) | `https://malka-suite-dev-documentos-…?…Signature=…`    |

La URL se obtiene del output `api_base_url` de Terraform en el repositorio del backend.

- `.env.example` está versionado y sirve de plantilla.
- `.env` está ignorado por git y **no se sube al repositorio**.

> Todas las variables con prefijo `VITE_` se incluyen en el código que descarga
> el navegador y cualquiera puede verlas. **Nunca guardar secretos ni credenciales
> en estas variables.**

## Scripts disponibles

| Comando           | Qué hace                                                                  |
| ----------------- | ------------------------------------------------------------------------- |
| `npm run dev`     | Levanta el servidor de desarrollo con recarga automática                  |
| `npm run build`   | Verifica los tipos con `tsc` y genera la versión de producción en `dist/` |
| `npm run preview` | Sirve localmente el contenido de `dist/` para probar el build             |
| `npm run lint`    | Analiza el código con ESLint                                              |
| `npm run format`  | Formatea todo el código con Prettier                                      |
| `npm run test`    | Corre los tests unitarios con Vitest                                      |

El `build` falla si hay errores de tipos, así que conviene ejecutarlo junto con
`lint` antes de abrir un pull request.

## Estructura del proyecto

```
src/
├── api/          # Cliente HTTP y funciones que llaman a cada endpoint
├── components/   # Componentes visuales reutilizables, sin lógica de datos
├── documentos/   # Lógica de dominio de documentos (validación, subida a S3)
├── pages/        # Pantallas completas: piden los datos y los pasan a los componentes
├── types/        # Tipos e interfaces que reflejan las respuestas del backend
├── App.tsx       # Componente raíz
└── main.tsx      # Punto de entrada de la aplicación
```

## Subida de documentos (#15)

El archivo nunca pasa por la API: se pide una URL prefirmada de S3 y el
navegador sube directo al bucket, con progreso y un reintento si el enlace
venció. El contrato del endpoint (`POST /api/v1/documentos/subidas`) está
propuesto en `src/types/documentos.ts` y se ajusta cuando el backend
publique el definitivo (#38).

Mientras tanto, la pantalla se puede probar con una prefirmada generada a
mano (ver `VITE_URL_SUBIDA_FICTICIA` arriba).

Todas las llamadas a la API pasan por `src/api/client.ts`, que arma la URL a partir
de `VITE_API_BASE_URL` y centraliza el manejo de errores. Ningún otro archivo usa
`fetch` directamente.

## Problemas comunes

**La pantalla muestra "No se pudo conectar con la API"**

Revisar la consola del navegador (`F12` → Console):

- Si aparece `blocked by CORS policy`, el API Gateway no tiene habilitado el origen
  del frontend (por ejemplo `http://localhost:5173`). Se configura en el backend,
  en `infra/api.tf`.
- Si no aparece un error de CORS, verificar que la URL de `.env` sea correcta y que
  la API responda:

  ```bash
  curl <VITE_API_BASE_URL>/health
  ```

**Aparece "Falta configurar VITE_API_BASE_URL"**

El archivo `.env` no existe, está vacío o no está en la raíz del proyecto.
