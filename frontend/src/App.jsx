import { useCallback, useMemo, useState } from 'react'

const columns = [
  { key: 'ticket_devolucion', label: 'TICKET DEVOLUCION' },
  { key: 'ticket_factura', label: 'TICKET FACTURA' },
  { key: 'caja', label: 'CAJA' },
  { key: 'tienda', label: 'TIENDA' },
  { key: 'vendedor', label: 'VENDEDOR' },
  { key: 'monto_devuelto', label: 'MONTO DEVUELTO' },
  { key: 'medio_pago', label: 'MEDIO DE PAGO' },
  { key: 'motivo', label: 'MOTIVO' },
  { key: 'comentario', label: 'COMENTARIO' },
  { key: 'tipo_documento', label: 'TIPO' },
  { key: 'fecha_operacion', label: 'FECHA' },
]

const createInitialRow = () =>
  columns.reduce(
    (acc, col) => ({
      ...acc,
      [col.key]: col.key === 'tipo_documento' ? 'devolucion' : col.key === 'fecha_operacion' ? new Date().toISOString().slice(0, 10) : '',
    }),
    {},
  )

function App() {
  const [rows, setRows] = useState([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE || 'http://localhost:8000',
    [],
  )

  const handleDrop = useCallback(async (event) => {
    event.preventDefault()
    setIsDragging(false)
    const files = event.dataTransfer?.files
    if (!files?.length) return
    await uploadFiles(Array.from(files))
  }, [])

  const uploadFiles = async (files) => {
    if (!files.length) return
    setUploading(true)
    setStatus('')
    setError('')
    try {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))

      const response = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) throw new Error('Error al procesar archivos')
      const data = await response.json()
      const incoming = Array.isArray(data?.results) ? data.results : []
      const normalized = (incoming.length ? incoming : [createInitialRow()]).map((row) => ({
        ...createInitialRow(),
        ...row,
      }))
      setRows(normalized)
      setStatus('Datos cargados listos para revisión')
    } catch (err) {
      setError(err.message || 'Error al subir archivos')
    } finally {
      setUploading(false)
    }
  }

  const handleFileInput = async (event) => {
    const files = event.target.files
    if (!files?.length) return
    await uploadFiles(Array.from(files))
    event.target.value = ''
  }

  const handleChange = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      return next
    })
  }

  const addEmptyRow = () => setRows((prev) => [...prev, { ...createInitialRow() }])

  const handleSave = async () => {
    if (!rows.length) return
    setSaving(true)
    setStatus('')
    setError('')
    try {
      const response = await fetch(`${apiBase}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: rows }),
      })
      if (!response.ok) throw new Error('Error al guardar CSV')
      const res = await response.json()
      const files = Array.isArray(res?.files) ? res.files : []
      setStatus(
        files.length
          ? `Registros guardados en: ${files.join(', ')}`
          : 'Registros guardados'
      )
    } catch (err) {
      setError(err.message || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-slate-900">
            Recuento diario de facturas
          </h1>
          <p className="text-slate-600">
            Sube imágenes o PDFs, revisa los campos y confirma para guardar.
          </p>
        </header>

        <section>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-white'} px-6 py-10 text-center shadow-sm transition`}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*,.pdf"
              multiple
              onChange={handleFileInput}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <div className="space-y-2">
              <p className="text-lg font-medium text-slate-900">
                Arrastra y suelta aquí tus facturas
              </p>
              <p className="text-sm text-slate-500">
                Formatos: imágenes o PDF. Múltiples archivos permitidos.
              </p>
              <label
                htmlFor="file-input"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500"
              >
                Seleccionar archivos
              </label>
            </div>
          </div>
          {uploading && (
            <p className="mt-3 text-sm text-indigo-600">Procesando archivos…</p>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">Datos extraídos</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addEmptyRow}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Añadir fila
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || uploading || !rows.length}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Confirmar y Guardar'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-700 uppercase text-xs">
                <tr>
                  {columns.map((col) => (
                    <th key={col.key} className="px-4 py-3 font-semibold">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-6 text-center text-slate-500"
                    >
                      Sube archivos para iniciar o añade una fila manual.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-2">
                          {col.key === 'tipo_documento' ? (
                            <select
                              value={row[col.key] ?? 'devolucion'}
                              onChange={(e) => handleChange(idx, col.key, e.target.value)}
                              className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="devolucion">Devolución</option>
                              <option value="original">Original</option>
                            </select>
                          ) : col.key === 'fecha_operacion' ? (
                            <input
                              type="date"
                              value={row[col.key] ?? ''}
                              onChange={(e) => handleChange(idx, col.key, e.target.value)}
                              className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={row[col.key] ?? ''}
                              onChange={(e) => handleChange(idx, col.key, e.target.value)}
                              className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {(status || error) && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {error || status}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
