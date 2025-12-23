# Recuento diario de facturas

Aplicación web para subir facturas (imágenes/PDF), revisar los campos extraídos y guardarlos en CSVs por día (`DEV_<YYYYMMDD>.csv`) con el formato solicitado. Incluye modo oscuro y carga opcional de un Excel base para guiar el esquema.

## Estructura
- `frontend/`: React + Vite + Tailwind (dropzone, tabla editable, confirmación de guardado).
- `backend/`: FastAPI con endpoints `/upload` (mock/Groq) y `/save` (agrupa por fecha y guarda en CSV por día).
- Extra: `/baseline` acepta un Excel (.xlsx/.xls) de referencia; el frontend tiene un botón para subirlo.

## Ejecutar el backend
1. Activar el entorno (ya configurado en `.venv`).
2. Instalar dependencias (ya instaladas):
   ```bash
   cd backend
   ../.venv/bin/python -m pip install -r requirements.txt
   ```
3. Clave Groq: coloca `GROQ_API_KEY=tu_clave` en `backend/.env` (ya creado y no versionado) o expórtala en la sesión.
4. Iniciar FastAPI (cargando .env):
   ```bash
   ../.venv/bin/python -m uvicorn main:app --reload --env-file .env --host 0.0.0.0 --port 8000
   ```

## Ejecutar el frontend
1. Instalar dependencias (si hace falta):
   ```bash
   cd frontend
   npm install
   ```
2. (Recomendado) define la URL del backend: copia `.env.example` a `.env` y ajusta `VITE_API_BASE` (p. ej. `http://localhost:8000`).
3. Levantar en desarrollo:
   ```bash
   npm run dev
   ```
4. Build de producción:
   ```bash
   npm run build
   ```

## Uso
1. (Opcional) Sube el Excel base en la tarjeta **Baseline Excel** para fijar el esquema esperado.
2. Arrastra/selecciona múltiples imágenes o PDFs.
3. El backend devuelve datos mock (`extract_data_from_image`), que se muestran en la tabla editable.
4. Ajusta los campos: TICKET DEVOLUCION, TICKET FACTURA, CAJA, TIENDA, VENDEDOR, MONTO DEVUELTO, MEDIO DE PAGO, MOTIVO, COMENTARIO, TIPO (original/devolución) y FECHA.
5. Pulsa **Confirmar y Guardar** para enviar `/save`; se crean/actualizan archivos `DEV_<fecha>.csv` por cada día encontrado.
6. Cambia a modo oscuro con el switch en el encabezado si prefieres el tema oscuro.

## Formato del CSV (por día)
- Nombre: `DEV_<YYYYMMDD>.csv` (si no hay fecha, `DEV_SIN_FECHA.csv`).
- Fila 7: `TIENDA CANAL DIGITAL T-45-63`.
- Fila 10: encabezados con los campos anteriores (incluye TIPO y FECHA).
- Las nuevas filas se insertan después de la última fila con datos y antes de cualquier fila que comience con `TOTAL DEV`.

## Mock de extracción
La función `extract_data_from_image_bytes` usa Groq (modelo vision) si existe `GROQ_API_KEY`; si no, devuelve valores vacíos/genéricos como mock.

## Producción / despliegue
- Backend: desplegado en Render (`https://devsinsa.onrender.com`).
- Frontend: configure `VITE_API_BASE` en Vercel (o entorno equivalente) apuntando a la URL del backend para evitar llamadas a `localhost` en producción.
