# Thai OCR sidecar (PaddleOCR)

Serves the Thai OCR used by the menu-scan feature (plan 11). PaddleOCR reads photographed Thai
menus far better than the in-process Tesseract.js path; the Node API calls this over localhost.

## Run (local dev)
    python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time
    .venv/bin/python server.py            # serves http://127.0.0.1:8091

Then point the API at it: set `OCR_URL=http://127.0.0.1:8091/ocr` in apps/api/.env
(unset → the API falls back to the built-in Tesseract.js path).

## Contract
    POST /ocr   multipart file "image"  ->  { lines: [{ text, confidence:0-100 }] }
    GET  /health -> { status: "ok" }
