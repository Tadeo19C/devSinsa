# Frontend (React + Vite + Tailwind)

UI para subir facturas, revisar campos y guardar en CSV. Incluye modo oscuro y carga de Excel base.

## Scripts
- Instalar deps: `npm install`
- Dev: `npm run dev`
- Build: `npm run build`

## Configuración
- Copia `.env.example` a `.env` y asigna `VITE_API_BASE` (ej: `http://localhost:8000` o la URL del backend en Render).

## Funciones clave
- Dropzone para imágenes/PDFs con arrastrar y soltar.
- Tabla editable con todos los campos (incluye `tipo_documento` y `fecha_operacion`).
- Botón **Baseline Excel** para subir `.xlsx/.xls` hacia `/baseline` y fijar el esquema.
- Switch de modo oscuro en el encabezado.
- Alertas de estado/errores y spinner de carga.

## Producción
En Vercel u otro host, define `VITE_API_BASE=https://devsinsa.onrender.com` (o la URL de tu backend) para evitar llamadas a `localhost`.
