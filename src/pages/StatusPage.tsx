import { useEffect, useState } from 'react'
import { getHealth } from '@/api/health'
import StatusCard from '@/components/StatusCard'
import type { Health } from '@/types/health'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; health: Health }

function StatusPage() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let ignore = false

    getHealth()
      .then((health) => {
        if (!ignore) setState({ status: 'success', health })
      })
      .catch((error: unknown) => {
        if (ignore) return
        const message =
          error instanceof Error ? error.message : 'Error desconocido'
        setState({ status: 'error', message })
      })

    return () => {
      ignore = true
    }
  }, [])

  return (
    <main>
      <h1>Estado de la API</h1>

      {state.status === 'loading' && <p>Consultando…</p>}
      {state.status === 'error' && <p role="alert">{state.message}</p>}
      {state.status === 'success' && <StatusCard health={state.health} />}
    </main>
  )
}

export default StatusPage
