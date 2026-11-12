import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Archive,
  CircleSlash,
  Hexagon,
  PackageCheck,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { describirError, esApiError } from '@/api/client'
import { bancos, parques, razas } from '@/api/recursos'
import { tandas } from '@/api/tandas'
import { puede } from '@/auth/identidad'
import { useSesion } from '@/auth/useSesion'
import { EncabezadoDePagina } from '@/components/pagina/EncabezadoDePagina'
import { Button } from '@/components/ui/button'
import { Cargando, ErrorDePantalla } from '@/components/ui/estados'
import { Modal, ModalContenido } from '@/components/ui/modal'
import { useListado } from '@/hooks/useRecurso'
import { formatearFecha } from '@/lib/fechas'
import { IndicadoresDeTanda } from '@/modulos/produccion/IndicadoresDeProduccion'
import { OperacionDeTanda } from '@/modulos/produccion/OperacionDeTanda'
import {
  ACCIONES,
  accionesPosibles,
  resumenDe,
  resumenDeOperacion,
} from '@/modulos/produccion/operaciones'
import {
  CLAVE_TANDAS,
  ROLES_PRODUCCION,
  edadEnDias,
  textoDeSalida,
} from '@/modulos/produccion/tandas'
import {
  CeldasDeLaTanda,
  DondeSeIntrodujo,
  ResultadoDeLaTanda,
  TablaDeNucleos,
  UbicacionDeTanda,
} from '@/modulos/produccion/UbicacionDeTanda'
import { Badge } from '@/components/ui/badge'
import { estaAtrasada, estadoDeTanda } from '@/lib/tandas'
import { CLAVE_DISPONIBILIDAD } from '@/modulos/ventas/pedidos'
import type {
  AccionDeTanda,
  OperacionCrear,
  OperacionRealizada,
  TandaDetalle,
} from '@/tipos/dominio'

/** Los nombres de una tanda vieja pueden ser de un parque o una raza ya
 *  dados de baja: se piden todos. */
const CON_BAJAS = { incluir_inactivos: 'true' }

const ICONO: Record<AccionDeTanda, LucideIcon> = {
  descartar: CircleSlash,
  introducir: Hexagon,
  cosechar: PackageCheck,
  pasar_a_banco: Archive,
}

/** Lo último que se hizo: el texto y, si fue una introducción, el reparto
 *  que eligió el sistema. */
type Hecho = { texto: string; reparto: OperacionRealizada['reparto'] }

function descripcionDe(tanda: TandaDetalle): string {
  const continuadora =
    tanda.fila_continuadora !== null
      ? `continuadora en fila ${tanda.fila_continuadora}, posición ${tanda.posicion_continuadora}`
      : 'continuadora sin cargar'
  const edad = edadEnDias(tanda)
  const fechaCosecha = tanda.resultado.fecha_cosecha
  const salida =
    estadoDeTanda(tanda) === 'cosechada'
      ? fechaCosecha
        ? `Cosechada el ${formatearFecha(fechaCosecha)}`
        : 'Cosechada'
      : textoDeSalida(tanda)
  return [
    `Traslarve: ${formatearFecha(tanda.fecha_traslarve)}${tanda.retroactivo ? ' (carga retroactiva)' : ''}`,
    `${edad} ${edad === 1 ? 'día' : 'días'}`,
    salida,
    continuadora,
  ].join(' · ')
}

/** Detalle de una tanda (#9): sus celdas por estado, dónde están y las
 *  operaciones por lote del campo. */
export default function TandaPage() {
  const { id = '' } = useParams()
  const { identidad } = useSesion()
  const consultas = useQueryClient()
  // La operación en curso con su Idempotency-Key, fija mientras el modal
  // está abierto: un reintento no mueve celdas dos veces.
  const [dialogo, setDialogo] = useState<{
    accion: AccionDeTanda
    clave: string
  } | null>(null)
  const [hecho, setHecho] = useState<Hecho | null>(null)

  const detalle = useQuery({
    queryKey: [CLAVE_TANDAS, 'detalle', id],
    queryFn: () => tandas.obtener(id),
  })
  const listaRazas = useListado('razas', razas, CON_BAJAS)
  const listaParques = useListado('parques', parques, CON_BAJAS)
  const listaBancos = useListado('bancos', bancos, CON_BAJAS)

  // Una operación cambia la tanda, la ocupación de los parques, las reinas
  // de los bancos y el stock para vender.
  const alCambiar = () =>
    Promise.all(
      [CLAVE_TANDAS, 'bancos', 'nucleos', 'parques', CLAVE_DISPONIBILIDAD].map(
        (clave) => consultas.invalidateQueries({ queryKey: [clave] }),
      ),
    )
  const operar = useMutation({
    mutationFn: ({ op, clave }: { op: OperacionCrear; clave: string }) =>
      tandas.operar(id, op, clave),
    // Un 409 dice que la tanda ya no está como se ve (otra pestaña u otra
    // persona): se refresca para mostrarla como quedó.
    onError: (error) => {
      if (esApiError(error) && error.status === 409) void alCambiar()
    },
    onSuccess: async (realizada, { op }) => {
      await alCambiar()
      // El parque y el banco no vuelven en la respuesta: salen de lo enviado.
      const parque =
        op.accion === 'introducir'
          ? listaParques.filas.find((p) => p.id === op.parque_id)?.nombre
          : undefined
      const banco =
        op.accion === 'pasar_a_banco'
          ? listaBancos.filas.find((b) => b.id === op.banco_id)?.identificador
          : undefined
      setHecho({
        texto: resumenDeOperacion(realizada, { parque, banco }),
        reparto: realizada.reparto ?? null,
      })
      setDialogo(null)
    },
  })

  const volver = (
    <Link
      to="/produccion/tandas"
      className="inline-flex items-center gap-1 text-sm text-texto-suave hover:text-texto focus-visible:outline-2 focus-visible:outline-acento"
    >
      <ArrowLeft className="size-4" aria-hidden /> Tandas
    </Link>
  )

  const todas = [detalle, listaRazas, listaParques, listaBancos]
  if (todas.some((c) => c.isPending))
    return (
      <section className="space-y-seccion">
        {volver}
        <Cargando columnas={4} filas={3} />
      </section>
    )
  const fallo = todas.find((c) => c.isError)
  if (fallo || !detalle.data)
    return (
      <section className="space-y-seccion">
        {volver}
        <ErrorDePantalla
          error={describirError(fallo?.error)}
          reintentar={() => todas.forEach((c) => void c.refetch())}
        />
      </section>
    )

  const tanda = detalle.data
  const raza =
    listaRazas.filas.find((r) => r.id === tanda.raza_id)?.nombre ??
    'raza desconocida'
  const nombresDeParque = new Map(
    listaParques.filas.map((p) => [p.id, p.nombre]),
  )
  const escribe = puede(identidad, ROLES_PRODUCCION)
  const posibles = accionesPosibles(resumenDe(tanda))
  // El paso que sigue en el ciclo va resaltado; descartar es un desvío y
  // solo se resalta si es lo único que queda.
  const siguiente = posibles.find((a) => a !== 'descartar') ?? posibles[0]

  const abrir = (accion: AccionDeTanda) => {
    operar.reset()
    setHecho(null)
    setDialogo({ accion, clave: crypto.randomUUID() })
  }
  const cerrar = () => !operar.isPending && setDialogo(null)

  const acciones =
    escribe && posibles.length > 0 ? (
      <>
        {posibles.map((accion) => {
          const Icono = ICONO[accion]
          return (
            <Button
              key={accion}
              variante={accion === siguiente ? 'primario' : 'secundario'}
              disabled={operar.isPending}
              onClick={() => abrir(accion)}
            >
              <Icono className="size-4" aria-hidden /> {ACCIONES[accion].boton}
            </Button>
          )
        })}
      </>
    ) : undefined

  return (
    <section className="space-y-seccion">
      {volver}
      <EncabezadoDePagina
        titulo={`Tanda de ${raza}`}
        descripcion={descripcionDe(tanda)}
        acciones={acciones}
      />

      {estaAtrasada(tanda) ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-texto">
          <Badge tono="aviso">Atrasada</Badge>
          Ya pasó el día de salida y todavía no se cosechó.
        </p>
      ) : null}

      <div role="status" className="empty:hidden">
        {hecho ? (
          <div className="space-y-3 rounded-tarjeta border border-ok/40 bg-ok/10 p-4">
            <p className="text-sm text-texto">{hecho.texto}</p>
            {hecho.reparto && hecho.reparto.length > 0 ? (
              <TablaDeNucleos
                etiqueta="Reparto de la introducción"
                nucleos={hecho.reparto}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <DondeSeIntrodujo
        tanda={tanda}
        nombreDeParque={(parqueId) =>
          nombresDeParque.get(parqueId) ?? 'Parque desconocido'
        }
        alIntroducir={
          escribe && posibles.includes('introducir')
            ? () => abrir('introducir')
            : undefined
        }
      />
      <ResultadoDeLaTanda tanda={tanda} />
      <CeldasDeLaTanda tanda={tanda} />
      <IndicadoresDeTanda
        tandaId={tanda.id}
        fechaTraslarve={tanda.fecha_traslarve}
      />
      <UbicacionDeTanda
        tanda={tanda}
        nombreDeParque={(parqueId) =>
          nombresDeParque.get(parqueId) ?? 'Parque desconocido'
        }
      />

      <Modal
        open={dialogo !== null}
        // Mientras guarda no se cierra: el resultado tiene que verse.
        onOpenChange={(abierto) => !abierto && cerrar()}
      >
        {dialogo ? (
          <ModalContenido
            titulo={ACCIONES[dialogo.accion].titulo}
            descripcion={ACCIONES[dialogo.accion].descripcion}
          >
            <OperacionDeTanda
              key={dialogo.clave}
              accion={dialogo.accion}
              tanda={tanda}
              parques={listaParques.filas.filter((p) => p.activo)}
              bancos={listaBancos.filas.filter((b) => b.activo)}
              alGuardar={(op) =>
                operar.mutateAsync({ op, clave: dialogo.clave })
              }
              alCancelar={cerrar}
            />
          </ModalContenido>
        ) : null}
      </Modal>
    </section>
  )
}
