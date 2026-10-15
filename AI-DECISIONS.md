# Decisiones tomadas con IA — frontend

Registro de dónde se usó IA, qué generó y qué tiene que revisar una persona.
Mismo criterio que `AI-DECISIONS.md` del backend.

## 1. Login con Cognito: hosted UI + Authorization Code con PKCE (#6) — 15/10/2026

**Contexto.** El #6 pedía decidir entre el hosted UI de Cognito y un login
propio, y registrarlo acá. El backend valida el **ID token** (`app/auth.py`:
`aud`, `iss`, `token_use = id`, `custom:tenant_id`). El app client de
Terraform ya estaba listo: cliente público sin secret, flujo `code`, callbacks
`<origen>/auth/callback` para localhost:5173 y CloudFront.

**Decisión.** Hosted UI de Cognito + Authorization Code con PKCE (S256), con
la librería `oidc-client-ts`.

| Alternativa | Por qué no |
|---|---|
| Formulario propio con `USER_PASSWORD_AUTH` | La contraseña pasaría por nuestro JavaScript; además ese flujo está apagado en Terraform (`cognito_password_auth_habilitado`). |
| Formulario propio con SRP (Amplify) | Amplify suma cientos de kB y más superficie para lo mismo. |
| Implicit flow | Deprecado (OAuth 2.0 Security BCP): el token viaja en la URL. |
| PKCE escrito a mano | Es código de seguridad: mejor una librería OIDC mantenida y probada. |

**Dónde se guarda la sesión.** `sessionStorage` (por pestaña, se borra al
cerrarla), nunca `localStorage` (pedido del #6). Trade-off aceptado: un XSS
podría leerla igual que cualquier almacenamiento del navegador; se mitiga sin
`dangerouslySetInnerHTML` y con React escapando todo. Una CSP en CloudFront
queda como mejora (la sesión en memoria obligaría a volver al hosted UI en
cada recarga).

**Qué generó la IA (Claude Code).** `src/auth/*`, `src/pages/LoginPage.tsx`,
`src/pages/CallbackPage.tsx`, los cambios en `api/client.ts`, `app/router.tsx`,
`app/AppLayout.tsx` y `PaginaCatalogo.tsx`, y `tests/auth.test.tsx`.

**Qué verificó la IA.** 80 tests en verde; en el navegador, que una ruta
privada sin sesión manda a `/login?volver=…`, que "Ingresar" redirige al
hosted UI con `response_type=code`, `code_challenge_method=S256`, `state` y
el `redirect_uri` registrado, y que el estado queda solo en `sessionStorage`.

**Qué NO verificó (lo tiene que probar una persona).** El ingreso completo
con un usuario real: la IA no escribe contraseñas. DoD del #6:
1. Login con un usuario de prueba de cada rol (`docs/cognito.md` del backend).
2. `lectura` ve los catálogos sin botones de alta/edición/baja; `produccion`
   escribe en producción e ítems; `ventas`, en clientes.
3. Salir cierra la sesión de la app y la del hosted UI.
4. Token vencido o revocado: vuelve al login sin pantalla rota (forzarlo
   borrando `oidc.user:*` de sessionStorage, o esperando los 60 min del ID token).

**Revisa:** Pía (dueña del tema seguridad según el #6).
