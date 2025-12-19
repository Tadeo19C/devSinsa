# Recuento diario de facturas

Aplicación web para subir facturas (imágenes/PDF), revisar los campos extraídos y guardarlos en `DEV_DICIEMBRE_2025.csv` con el formato solicitado.

## Estructura
- `frontend/`: React + Vite + Tailwind (dropzone, tabla editable, confirmación de guardado).
- `backend/`: FastAPI con endpoints `/upload` (mock) y `/save` (append CSV).

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
2. (Opcional) definir la URL del backend: crear `.env` con `VITE_API_BASE=http://localhost:8000`.
3. Levantar en desarrollo:
   ```bash
   npm run dev
   ```
4. Build de producción:
   ```bash
   npm run build
   ```

## Uso
1. En la UI, arrastra/selecciona múltiples imágenes o PDFs.
2. El backend devuelve datos mock (`extract_data_from_image`), que se muestran en la tabla editable.
3. Ajusta los campos: TICKET DEVOLUCION, TICKET FACTURA, CAJA, TIENDA, VENDEDOR, MONTO DEVUELTO, MEDIO DE PAGO, MOTIVO, COMENTARIO.
4. Pulsa **Confirmar y Guardar** para enviar `/save` y anexar al CSV.

## Formato del CSV
- Fila 7: `TIENDA CANAL DIGITAL T-45-63`.
- Fila 10: encabezados con los campos anteriores.
- Las nuevas filas se insertan después de la última fila con datos y antes de cualquier fila que comience con `TOTAL DEV`.

## Mock de extracción
La función `extract_data_from_image_bytes` usa Groq (modelo vision) si existe `GROQ_API_KEY`; si no, devuelve valores vacíos/genéricos como mock.
