# Login (issue #6): el flujo de punta a punta

```
Usuario          App (React)                 Cognito (hosted UI)          Backend
  │  abre /ventas/clientes                                                   │
  │──────────────▶ RutaPrivada: ¿hay sesión?                                 │
  │               no → /login?volver=/ventas/clientes                        │
  │  "Ingresar"  ─▶ UserManager.signinRedirect()                             │
  │               genera code_verifier (queda en sessionStorage)             │
  │               y manda code_challenge = SHA256(verifier) ──▶ /oauth2/authorize
  │  escribe usuario y contraseña EN COGNITO (nunca en la app) ◀──┘          │
  │               ◀── /auth/callback?code=…&state=…                          │
  │               CallbackPage: signinRedirectCallback()                     │
  │               canjea code + code_verifier ─────────────▶ /oauth2/token   │
  │               ◀── id_token + access_token + refresh_token                │
  │               vuelve a /ventas/clientes                                  │
  │               GET /api/v1/clientes  Authorization: Bearer <ID token> ───▶│
  │                                                  valida firma, aud, iss, │
  │                                                  token_use=id, tenant    │
```

## Piezas

| Archivo           | Qué hace                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.ts`       | Arma la configuración desde `VITE_COGNITO_*`. Redirect y logout salen de `window.location.origin` (contrato del 07/10 en el #6). Si falta una variable, la app lo dice en pantalla. |
| `sesion.tsx`      | El único lugar que conoce Cognito. Crea el `UserManager`, le pasa el token al cliente HTTP y reacciona a un 401.                                                                    |
| `useSesion.ts`    | El hook que usa el resto de la app: `identidad`, `ingresar`, `salir`.                                                                                                               |
| `identidad.ts`    | Lee `email`, `cognito:groups` y `custom:tenant_id` del ID token. `puede(identidad, roles)` decide qué botones mostrar.                                                              |
| `RutaPrivada.tsx` | Sin sesión, manda a `/login` recordando la pantalla.                                                                                                                                |

## Decisiones que conviene entender

- **Se manda el ID token, no el access token.** El de Cognito no trae `aud` ni `custom:tenant_id`, y el backend los exige (`docs/cognito.md`).
- **PKCE:** el `code` que vuelve en la URL no sirve sin el `code_verifier`, que nunca salió de esta pestaña. No hay client secret (cliente público).
- **Renovación:** el ID token dura 60 min; `automaticSilentRenew` usa el refresh token (30 días) antes de que venza. Si Cognito lo rechaza (`invalid_grant`), la sesión se descarta y se vuelve al login; un corte de red no la cierra.
- **401 del backend:** `api/client.ts` avisa (`fijarAlNoAutenticado`), la sesión se borra y `RutaPrivada` manda al login con `?volver=`.
- **`?volver=` solo acepta rutas internas** (`destinoSeguro`): si no, el login serviría para redirigir a cualquier sitio (open redirect). Rechaza `//`, barras invertidas y caracteres de control (`/\\evil.com` y `/\t/evil.com` el navegador los resuelve como `evil.com`).
- **Los roles en la UI son comodidad.** Esconden lo que el usuario no puede hacer, pero el que decide es el backend (`require_role` → 403).
- **Salir**, en este orden: revoca el refresh token en Cognito (`/oauth2/revoke`; si no, serviría 30 días más), borra la sesión local (así el ID token no viaja como `id_token_hint` en la URL) y llama al `/logout` del hosted UI, que cierra también la sesión de Cognito.
- **Modo demo:** con `VITE_DATOS_SIMULADOS=true` no hay login. Corre con un usuario de ejemplo `admin` y el banner fijo.

## Probarlo en local

`.env.local` con las `VITE_COGNITO_*` (son públicas: están en las variables del repo) y la app en **localhost:5173**, que es el origen registrado en Cognito y en el CORS. Los usuarios de prueba están en `docs/cognito.md` del backend. La contraseña se pide al equipo y no se versiona.
