/** Configuración del login con Cognito (issue #6).
 *
 *  Flujo: Authorization Code + PKCE contra el hosted UI de Cognito. La app
 *  nunca ve la contraseña: redirige al hosted UI y vuelve con un código de
 *  un solo uso que se canjea por los tokens (cliente público, sin secret).
 *
 *  Contrato fijado por el equipo (comentario del 07/10 en el #6):
 *  - las variables VITE_COGNITO_* salen de outputs de Terraform (no secretas);
 *  - redirect y logout NO son variables: salen de window.location.origin, así
 *    el mismo build anda en localhost:5173 y en CloudFront. Los dos tienen que
 *    estar en `origenes_permitidos` de Terraform (callbacks de Cognito). */
import { WebStorageStateStore, type UserManagerSettings } from 'oidc-client-ts'

const VARIABLES = [
  'VITE_COGNITO_USER_POOL_ID',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_COGNITO_DOMAIN',
  'VITE_COGNITO_REGION',
] as const

export type EntornoCognito = Partial<Record<(typeof VARIABLES)[number], string>>

export class ConfiguracionIncompleta extends Error {
  constructor(faltantes: readonly string[]) {
    super(`Falta configurar el login: ${faltantes.join(', ')}.`)
    this.name = 'ConfiguracionIncompleta'
  }
}

export const RUTA_CALLBACK = '/auth/callback'

export function configuracionCognito(
  entorno: EntornoCognito,
  origen: string,
  almacen: Storage,
): UserManagerSettings {
  const faltantes = VARIABLES.filter((nombre) => !entorno[nombre])
  if (faltantes.length > 0) throw new ConfiguracionIncompleta(faltantes)

  const region = entorno.VITE_COGNITO_REGION as string
  const poolId = entorno.VITE_COGNITO_USER_POOL_ID as string
  const hostedUi = `https://${entorno.VITE_COGNITO_DOMAIN as string}`
  const emisor = `https://cognito-idp.${region}.amazonaws.com/${poolId}`
  // sessionStorage, nunca localStorage (#6): la sesión vive en esta pestaña y
  // se borra al cerrarla. El estado del flujo (verificador PKCE) también.
  const store = new WebStorageStateStore({ store: almacen })

  return {
    authority: emisor,
    client_id: entorno.VITE_COGNITO_CLIENT_ID as string,
    redirect_uri: `${origen}${RUTA_CALLBACK}`,
    post_logout_redirect_uri: `${origen}/`,
    response_type: 'code',
    scope: 'openid email profile',
    // Metadata explícita: el discovery de Cognito no publica el logout del
    // hosted UI, y así no hay una llamada extra al iniciar.
    metadata: {
      issuer: emisor,
      authorization_endpoint: `${hostedUi}/oauth2/authorize`,
      token_endpoint: `${hostedUi}/oauth2/token`,
      revocation_endpoint: `${hostedUi}/oauth2/revoke`,
      end_session_endpoint: `${hostedUi}/logout`,
      jwks_uri: `${emisor}/.well-known/jwks.json`,
    },
    // El ID token ya trae email, grupos y tenant: no hace falta /userInfo.
    loadUserInfo: false,
    // Renueva con el refresh token antes de que venza (ID token: 60 min).
    automaticSilentRenew: true,
    userStore: store,
    stateStore: store,
  }
}
