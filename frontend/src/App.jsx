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
  const [isDark, setIsDark] = useState(false)
  const [baselineStatus, setBaselineStatus] = useState('')
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [reporting, setReporting] = useState(false)

  const apiBase = useMemo(
    () => import.meta.env.VITE_API_BASE || 'http://localhost:8000',
    [],
  )

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev
      if (next) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      return next
    })
  }

  const uploadBaseline = async (file) => {
    if (!file) return
    setBaselineStatus('')
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(`${apiBase}/baseline`, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) throw new Error('Error al subir baseline Excel')
      const data = await response.json()
      setBaselineStatus(`Baseline cargada: ${data?.file || file.name}`)
    } catch (err) {
      setError(err.message || 'Error al subir baseline')
    }
  }

  const downloadMonthlyReport = async () => {
    if (!reportMonth) return
    const [yearStr, monthStr] = reportMonth.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!year || !month) return

    setReporting(true)
    setStatus('')
    setError('')
    try {
      const response = await fetch(`${apiBase}/report/monthly?year=${year}&month=${month}`, {
        method: 'GET',
      })
      if (!response.ok) throw new Error('Error al generar reporte')

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_${year}_${String(month).padStart(2, '0')}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      setStatus('Reporte descargado')
    } catch (err) {
      setError(err.message || 'Error al descargar reporte')
    } finally {
      setReporting(false)
    }
  }

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
    <div className={`min-h-screen ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <div className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-semibold">
            Recuento diario de facturas
            </h1>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium bg-white/70 dark:bg-slate-800/70 dark:border-slate-600 shadow"
            >
              {isDark ? 'Modo claro' : 'Modo oscuro'}
            </button>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
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
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed ${isDragging ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'} px-6 py-10 text-center shadow-sm transition`}
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
              <p className="text-lg font-medium text-slate-900 dark:text-slate-100">
                Arrastra y suelta aquí tus facturas
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-300">
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

        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/80">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Baseline Excel</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">Sube tu archivo base (.xlsx/.xls) para guiar el esquema.</p>
            </div>
            <label className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 cursor-pointer">
              Subir Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadBaseline(file)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {baselineStatus && (
            <div className="px-6 py-3 text-sm text-emerald-700 dark:text-emerald-200">{baselineStatus}</div>
          )}
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/80">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reporte mensual</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300">Genera un Excel con resumen y detalle del mes.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
                className="rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={downloadMonthlyReport}
                disabled={reporting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reporting ? 'Generando…' : 'Descargar'}
              </button>
            </div>
          </div>
        </section>

        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700/80">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Datos extraídos</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addEmptyRow}
                className="rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700"
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
              <thead className="bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-100 uppercase text-xs">
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
                      className="px-4 py-6 text-center text-slate-500 dark:text-slate-300"
                    >
                      Sube archivos para iniciar o añade una fila manual.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-700/70'}
                    >
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-2">
                          {col.key === 'tipo_documento' ? (
                            <select
                              value={row[col.key] ?? 'devolucion'}
                              onChange={(e) => handleChange(idx, col.key, e.target.value)}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                            >
                              <option value="devolucion">Devolución</option>
                              <option value="original">Original</option>
                            </select>
                          ) : col.key === 'fecha_operacion' ? (
                            <input
                              type="date"
                              value={row[col.key] ?? ''}
                              onChange={(e) => handleChange(idx, col.key, e.target.value)}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                            />
                          ) : (
                            <input
                              type="text"
                              value={row[col.key] ?? ''}
                              onChange={(e) => handleChange(idx, col.key, e.target.value)}
                              className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 px-2 py-2 text-sm focus:border-indigo-500 focus:outline-none"
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
                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/50 dark:bg-red-950 dark:text-red-100'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950 dark:text-emerald-100'
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
