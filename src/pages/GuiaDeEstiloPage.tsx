import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardTitulo } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Cargando, ErrorDePantalla, Vacio } from '@/components/ui/estados'
import { Field, Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Modal, ModalContenido, ModalTrigger } from '@/components/ui/modal'
import { Select, SelectContenido, SelectOpcion, SelectTrigger, SelectValor } from '@/components/ui/select'
import { DataTable, type Columna } from '@/components/ui/table'
import { ToastAviso, ToastProvider } from '@/components/ui/toast'

type FilaDemo = { id: string; raza: string; celdas: number; estado: string }
const columnas: Columna<FilaDemo>[] = [
  { clave: 'raza', titulo: 'Raza', orden: (a, b) => a.raza.localeCompare(b.raza) },
  { clave: 'celdas', titulo: 'Celdas', orden: (a, b) => a.celdas - b.celdas, render: (f) => <span className="font-mono">{f.celdas}</span> },
  { clave: 'estado', titulo: 'Estado', render: (f) => <Badge tono={f.estado === 'fecundada' ? 'ok' : 'miel'}>{f.estado}</Badge> },
]

export function GuiaDeEstiloPage() {
  const [modal, setModal] = useState(false)
  return (
    <ToastProvider>
      <div className="mx-auto max-w-3xl space-y-seccion p-4">
        <Breadcrumb items={[{ label: 'Malka Suite' }, { label: 'Guía de estilo', actual: true }]} />
        <h1 className="text-xl font-semibold text-texto">Guía de estilo — miel y ámbar</h1>

        <Card className="space-y-3">
          <CardTitulo>Botones (normal, cargando, deshabilitado)</CardTitulo>
          <div className="flex flex-wrap gap-2">
            <Button>Primario</Button>
            <Button variante="secundario">Secundario</Button>
            <Button variante="fantasma">Fantasma</Button>
            <Button cargando>Guardando</Button>
            <Button disabled>Deshabilitado</Button>
            <Button variante="peligro">Peligro</Button>
          </div>
        </Card>

        <Card className="space-y-3">
          <CardTitulo>Formulario con error de campo</CardTitulo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cantidad de cuadros" htmlFor="cuadros" ayuda="1 a 3 por tanda (135 cúpulas c/u)">
              <Select>
                <SelectTrigger id="cuadros"><SelectValor placeholder="Elegí…" /></SelectTrigger>
                <SelectContenido>
                  {[1, 2, 3].map((n) => <SelectOpcion key={n} value={String(n)}>{n} cuadro{n > 1 ? 's' : ''}</SelectOpcion>)}
                </SelectContenido>
              </Select>
            </Field>
            <Field label="Identificación de la madre" htmlFor="madre" error="La madre tiene que existir en el catálogo">
              <Input id="madre" invalido placeholder="Reina A-12" />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="retroactivo" />
            <Label htmlFor="retroactivo">Registro retroactivo</Label>
          </div>
        </Card>

        <Card className="space-y-3">
          <CardTitulo>Tabla con orden y paginación</CardTitulo>
          <DataTable
            columnas={columnas}
            filas={Array.from({ length: 12 }).map((_, i) => ({
              id: String(i),
              raza: ['Carniola', 'Buckfast', 'Italiana'][i % 3],
              celdas: [135, 270, 405][i % 3],
              estado: i % 2 ? 'fecundada' : 'en curso',
            }))}
            vacio={<Vacio titulo="Sin tandas cargadas">Creá la primera tanda para ver el ciclo de la celda.</Vacio>}
          />
        </Card>

        <Card className="space-y-3">
          <CardTitulo>Los tres estados + modal + toast</CardTitulo>
          <div className="grid gap-3 md:grid-cols-3">
            <div><p className="mb-1 text-xs text-texto-suave">Carga (skeleton)</p><Cargando columnas={2} filas={3} /></div>
            <Vacio titulo="Todavía no hay nada acá">Cuando exista una tanda, el ciclo aparece solo.</Vacio>
            <ErrorDePantalla error={{ codigo: 'STOCK_INSUFICIENTE', mensaje: 'No hay cúpulas para 3 cuadros.' }} reintentar={() => {}} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Modal open={modal} onOpenChange={setModal}>
              <ModalTrigger asChild><Button variante="secundario">Abrir modal</Button></ModalTrigger>
              <ModalContenido titulo="Confirmar traslarve" descripcion="Se descuentan las cúpulas del stock al confirmar.">
                <Button onClick={() => setModal(false)}>Confirmar</Button>
              </ModalContenido>
            </Modal>
            <ToastAviso titulo="Tanda creada" descripcion="270 celdas en estado trasladada." />
          </div>
        </Card>
      </div>
    </ToastProvider>
  )
}
