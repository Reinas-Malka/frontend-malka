/** Variables de build. Contrato en el issue #6 (comentario del 07/10): salen
 *  de outputs de Terraform y ninguna es secreta (terminan en el bundle). */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_COGNITO_USER_POOL_ID?: string
  readonly VITE_COGNITO_CLIENT_ID?: string
  readonly VITE_COGNITO_DOMAIN?: string
  readonly VITE_COGNITO_REGION?: string
  /** "true" solo en desarrollo o demos: datos de ejemplo, sin login, con banner. */
  readonly VITE_DATOS_SIMULADOS?: string
  readonly VITE_URL_SUBIDA_FICTICIA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
