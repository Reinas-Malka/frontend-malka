export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL
  if (!baseUrl) {
    throw new ApiError('Falta configurar VITE_API_BASE_URL en el archivo .env')
  }
  return baseUrl.replace(/\/+$/, '')
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${getBaseUrl()}${path}`, init)
  } catch {
    throw new ApiError(
      'No se pudo conectar con la API. Revisa la URL, tu conexión o la configuración de CORS.',
    )
  }

  if (!response.ok) {
    throw new ApiError(
      `La API respondió con el estado ${response.status}`,
      response.status,
    )
  }

  const data: unknown = await response.json()
  return data as T
}
