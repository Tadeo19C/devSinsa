import base64
import io
import json
import os
from datetime import date
from pathlib import Path
from typing import List, Dict, Any, DefaultDict
import csv
import requests
from collections import defaultdict

from fastapi.responses import StreamingResponse
from openpyxl import Workbook, load_workbook

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastapi import HTTPException

app = FastAPI(title="Recuento diario de facturas")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent
BASELINE_PATH = DATA_DIR / "baseline.xlsx"
REPORTS_DIR = DATA_DIR / "reports"

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


def _baseline_exists() -> bool:
    return BASELINE_PATH.exists() and BASELINE_PATH.is_file() and BASELINE_PATH.stat().st_size > 0


def _safe_float(value: str) -> float:
    if value is None:
        return 0.0
    s = str(value).strip()
    if not s:
        return 0.0
    s = s.replace("$", "").replace("L", "").replace(" ", "")
    # handle thousands separators + decimal comma
    if s.count(",") > 0 and s.count(".") == 0:
        s = s.replace(".", "")
        s = s.replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return 0.0


def _load_baseline_schema() -> Dict[str, Any]:
    if not _baseline_exists():
        return {"available": False}

    try:
        wb = load_workbook(BASELINE_PATH, read_only=True, data_only=True)
        sheets = []
        for name in wb.sheetnames:
            ws = wb[name]
            header = []
            # heuristic: first row with >= 3 non-empty cells (up to 50 columns)
            for row in ws.iter_rows(min_row=1, max_row=50, values_only=True):
                values = [str(v).strip() for v in (row[:50] if row else []) if v is not None and str(v).strip()]
                if len(values) >= 3:
                    header = values
                    break
            sheets.append({"name": name, "header": header})
        return {"available": True, "sheets": sheets}
    except Exception:
        return {"available": True, "sheets": []}


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

        baseline_schema = _load_baseline_schema()
        baseline_hint = ""
        if baseline_schema.get("available") and baseline_schema.get("sheets"):
            sheet_names = [s.get("name", "") for s in baseline_schema["sheets"] if s.get("name")]
            baseline_hint = (
                "\nContexto adicional (baseline Excel cargado): "
                f"pestañas={sheet_names}. "
                "Usa este contexto solo para alinear criterios, pero responde siempre con las llaves solicitadas."
            )

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
                        + baseline_hint
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


def _iter_month_csv_files(year: int, month: int) -> List[Path]:
    # DEV_YYYYMMDD.csv
    prefix = f"DEV_{year:04d}{month:02d}"
    files = sorted(DATA_DIR.glob(f"{prefix}[0-9][0-9].csv"))
    return [p for p in files if p.is_file()]


def _read_entries_from_csv(path: Path) -> List[Dict[str, Any]]:
    rows = read_rows(path)
    if len(rows) < 11:
        return []
    data_rows = rows[10:]
    out: List[Dict[str, Any]] = []
    for r in data_rows:
        if not r:
            continue
        if r and str(r[0]).strip().upper().startswith("TOTAL DEV"):
            break
        # normalize length
        values = (r + [""] * len(COLUMN_KEYS))[: len(COLUMN_KEYS)]
        entry = {COLUMN_KEYS[i]: str(values[i]) for i in range(len(COLUMN_KEYS))}
        out.append(entry)
    return out


def _build_monthly_report_xlsx(year: int, month: int) -> bytes:
    entries: List[Dict[str, Any]] = []
    for f in _iter_month_csv_files(year, month):
        entries.extend(_read_entries_from_csv(f))

    total_amount = sum(_safe_float(e.get("monto_devuelto", "")) for e in entries)
    total_count = len(entries)

    by_day: DefaultDict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "amount": 0.0})
    by_tienda: DefaultDict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "amount": 0.0})
    by_motivo: DefaultDict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "amount": 0.0})
    by_medio: DefaultDict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "amount": 0.0})
    by_tipo: DefaultDict[str, Dict[str, float]] = defaultdict(lambda: {"count": 0, "amount": 0.0})

    for e in entries:
        fecha = str(e.get("fecha_operacion", "")).strip() or "SIN_FECHA"
        tienda = str(e.get("tienda", "")).strip() or "(vacío)"
        motivo = str(e.get("motivo", "")).strip() or "(vacío)"
        medio = str(e.get("medio_pago", "")).strip() or "(vacío)"
        tipo = str(e.get("tipo_documento", "")).strip() or "(vacío)"
        amt = _safe_float(e.get("monto_devuelto", ""))

        by_day[fecha]["count"] += 1
        by_day[fecha]["amount"] += amt
        by_tienda[tienda]["count"] += 1
        by_tienda[tienda]["amount"] += amt
        by_motivo[motivo]["count"] += 1
        by_motivo[motivo]["amount"] += amt
        by_medio[medio]["count"] += 1
        by_medio[medio]["amount"] += amt
        by_tipo[tipo]["count"] += 1
        by_tipo[tipo]["amount"] += amt

    if _baseline_exists():
        wb = load_workbook(BASELINE_PATH)
    else:
        wb = Workbook()

    # Ensure sheets
    resumen_name = "RESUMEN"
    detalle_name = "DETALLE"
    if resumen_name in wb.sheetnames:
        ws_res = wb[resumen_name]
        ws_res.delete_rows(1, ws_res.max_row)
    else:
        ws_res = wb.create_sheet(resumen_name)

    if detalle_name in wb.sheetnames:
        ws_det = wb[detalle_name]
        ws_det.delete_rows(1, ws_det.max_row)
    else:
        ws_det = wb.create_sheet(detalle_name)

    # Summary
    ws_res.append(["REPORTE MENSUAL DEVOLUCIONES"])
    ws_res.append(["Periodo", f"{year:04d}-{month:02d}"])
    ws_res.append(["Total registros", total_count])
    ws_res.append(["Total monto devuelto", total_amount])
    ws_res.append([])

    def _write_table(title: str, rows: List[List[Any]]):
        ws_res.append([title])
        for r in rows:
            ws_res.append(r)
        ws_res.append([])

    _write_table(
        "Por día",
        [["FECHA", "CANTIDAD", "MONTO"]]
        + [[k, int(v["count"]), float(v["amount"])] for k, v in sorted(by_day.items())],
    )
    _write_table(
        "Por tienda",
        [["TIENDA", "CANTIDAD", "MONTO"]]
        + [[k, int(v["count"]), float(v["amount"])] for k, v in sorted(by_tienda.items(), key=lambda kv: kv[1]["amount"], reverse=True)],
    )
    _write_table(
        "Por motivo",
        [["MOTIVO", "CANTIDAD", "MONTO"]]
        + [[k, int(v["count"]), float(v["amount"])] for k, v in sorted(by_motivo.items(), key=lambda kv: kv[1]["amount"], reverse=True)],
    )
    _write_table(
        "Por medio de pago",
        [["MEDIO DE PAGO", "CANTIDAD", "MONTO"]]
        + [[k, int(v["count"]), float(v["amount"])] for k, v in sorted(by_medio.items(), key=lambda kv: kv[1]["amount"], reverse=True)],
    )
    _write_table(
        "Por tipo",
        [["TIPO", "CANTIDAD", "MONTO"]]
        + [[k, int(v["count"]), float(v["amount"])] for k, v in sorted(by_tipo.items(), key=lambda kv: kv[1]["amount"], reverse=True)],
    )

    # Detail
    ws_det.append(HEADERS)
    for e in entries:
        ws_det.append([str(e.get(k, "")) for k in COLUMN_KEYS])

    # If workbook is empty default sheet, keep it but do not erase baseline sheets.
    if "Sheet" in wb.sheetnames and len(wb.sheetnames) > 1:
        # Leave as-is if baseline had it; otherwise remove auto-created sheet
        try:
            wb.remove(wb["Sheet"])
        except Exception:
            pass

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


@app.post("/upload")
async def upload(files: List[UploadFile] = File(...)):
    results = []
    for file in files:
        content = await file.read()
        results.append(extract_data_from_image_bytes(content, file.filename))
    return {"results": results}


@app.post("/baseline")
async def baseline(file: UploadFile = File(...)):
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos Excel (.xlsx, .xls)")
    content = await file.read()
    BASELINE_PATH.write_bytes(content)
    return {"status": "baseline guardada", "file": BASELINE_PATH.name}


@app.get("/baseline/status")
async def baseline_status():
    if not _baseline_exists():
        return {"available": False}
    st = BASELINE_PATH.stat()
    return {
        "available": True,
        "file": BASELINE_PATH.name,
        "bytes": st.st_size,
        "modified": int(st.st_mtime),
    }


@app.get("/baseline/schema")
async def baseline_schema():
    return _load_baseline_schema()


@app.get("/report/monthly")
async def report_monthly(year: int, month: int):
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="month debe ser 1-12")
    content = _build_monthly_report_xlsx(year, month)
    filename = f"reporte_{year:04d}_{month:02d}.xlsx"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/save")
async def save(payload: EntriesPayload):
    files = append_entries(payload.entries)
    return {"status": "guardado", "files": files}
