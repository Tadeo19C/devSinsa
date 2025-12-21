import base64
import json
import os
from datetime import date
from pathlib import Path
from typing import List, Dict, Any, DefaultDict
import csv
import requests
from collections import defaultdict

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Recuento diario de facturas")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent

# Added tipo y fecha para clasificar original/devolución y particionar por día.
HEADERS = [
    "TICKET DEVOLUCION",
    "TICKET FACTURA",
    "CAJA",
    "TIENDA",
    "VENDEDOR",
    "MONTO DEVUELTO",
    "MEDIO DE PAGO",
    "MOTIVO",
    "COMENTARIO",
    "TIPO",
    "FECHA",
]
COLUMN_KEYS = [
    "ticket_devolucion",
    "ticket_factura",
    "caja",
    "tienda",
    "vendedor",
    "monto_devuelto",
    "medio_pago",
    "motivo",
    "comentario",
    "tipo_documento",
    "fecha_operacion",
]


class EntriesPayload(BaseModel):
    entries: List[Dict[str, Any]]


GROQ_API_KEY = os.getenv("GROQ_API_KEY")


def _mock_result() -> Dict[str, Any]:
    return {
        **{key: "" for key in COLUMN_KEYS},
        "tipo_documento": "devolucion",
        "fecha_operacion": date.today().isoformat(),
    }


def extract_data_from_image_bytes(image_bytes: bytes, filename: str) -> Dict[str, Any]:
    if not GROQ_API_KEY:
        return _mock_result()

    try:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        # Default to jpeg; Groq vision models accept data URLs
        data_url = f"data:image/jpeg;base64,{b64}"

        payload = {
            "model": "llama-3.2-11b-vision-preview",
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Eres un asistente que extrae campos de tickets/facturas "
                        "y responde solo JSON válido con llaves: "
                        + ", ".join(COLUMN_KEYS)
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": (
                                "Extrae los campos de la imagen y responde JSON con claves en snake_case. "
                                "Si un valor no existe, deja cadena vacía. No agregues comentarios ni texto adicional."
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url, "detail": "low"},
                        },
                    ],
                },
            ],
            "response_format": {"type": "json_object"},
        }

        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return {key: str(parsed.get(key, "")) for key in COLUMN_KEYS}
    except Exception:
        # Fallback to mock on any failure
        return _mock_result()


def get_csv_path(fecha: str) -> Path:
    # Remove dashes to keep filename compact; default when missing fecha
    slug = fecha.replace("-", "") if fecha else "SIN_FECHA"
    return DATA_DIR / f"DEV_{slug}.csv"


def read_rows(path: Path) -> List[List[str]]:
    if not path.exists():
        return []
    with path.open("r", newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def ensure_structure(rows: List[List[str]]) -> List[List[str]]:
    # Ensure at least 6 blank rows before row 7
    while len(rows) < 6:
        rows.append([])

    # Row 7 text
    if len(rows) < 7:
        rows.append(["TIENDA CANAL DIGITAL T-45-63"])
    else:
        first_cell = rows[6][0] if rows[6] else ""
        rows[6] = [first_cell or "TIENDA CANAL DIGITAL T-45-63"]

    # Two spacer rows before headers to land on row 10
    while len(rows) < 9:
        rows.append([])

    if len(rows) < 10:
        rows.append(HEADERS)
    else:
        rows[9] = HEADERS

    return rows


def find_total_dev_index(rows: List[List[str]]) -> int:
    for idx, row in enumerate(rows):
        if row and row[0].strip().upper().startswith("TOTAL DEV"):
            return idx
    return -1


def write_rows(path: Path, rows: List[List[str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)


def append_entries(entries: List[Dict[str, Any]]):
    grouped: DefaultDict[str, List[Dict[str, Any]]] = defaultdict(list)
    for entry in entries:
        fecha = str(entry.get("fecha_operacion", "")).strip()
        grouped[fecha].append(entry)

    saved_files = []
    for fecha, items in grouped.items():
        csv_path = get_csv_path(fecha)
        rows = ensure_structure(read_rows(csv_path))
        total_idx = find_total_dev_index(rows)
        insert_at = total_idx if total_idx != -1 else len(rows)

        data_rows = [[str(entry.get(key, "")) for key in COLUMN_KEYS] for entry in items]
        rows[insert_at:insert_at] = data_rows
        write_rows(csv_path, rows)
        saved_files.append(csv_path.name)

    return saved_files


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        content = await file.read()
        results.append(extract_data_from_image_bytes(content, file.filename))
    return {"results": results}


@app.post("/save")
async def save(payload: EntriesPayload):
    files = append_entries(payload.entries)
    return {"status": "guardado", "files": files}
