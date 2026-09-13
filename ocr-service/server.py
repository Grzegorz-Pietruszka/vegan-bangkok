"""Thai OCR sidecar (plan 11 OCR upgrade).

A small Flask service that loads the PaddleOCR Thai model ONCE at startup and exposes it to the
Node API. PaddleOCR reads photographed Thai menus far better than the in-process Tesseract.js
path (correct dish names at 95-99% confidence vs. garbled text), which is the whole reason this
sidecar exists. The Node API talks to it over localhost; it is NOT internet-facing.

Contract (matches src/ocr/extractText.ts's OcrLine shape so the pipeline is unchanged):
  POST /ocr   multipart file field "image"  ->  { "lines": [{ "text": str, "confidence": 0-100 }] }
  GET  /health -> { "status": "ok" }

Privacy: the image is held only in memory for the duration of the request and never written to
disk here; the Node route already strips EXIF and deletes its temp file.
"""
import io
from flask import Flask, request, jsonify
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np
from pythainlp.tokenize import word_tokenize

app = Flask(__name__)

# Loaded once at import — model init + first inference is the slow part; keeping it warm makes
# each scan a few seconds on CPU. Thai recognition + text-line orientation (menus are angled).
_ocr = PaddleOCR(lang="th", use_textline_orientation=True)


# Cap the longest side before OCR. On CPU, full-res (~1600px) menus take 80s+; ~1100px keeps
# the dish text readable while cutting inference to ~25-30s. On a GPU/real server this cap can
# be raised or removed. Override with OCR_MAX_SIDE.
import os
MAX_SIDE = int(os.environ.get("OCR_MAX_SIDE", "1100"))


def _extract(image_bytes: bytes):
    # decode via PIL → RGB ndarray (PaddleOCR wants an array or path; avoids a temp file)
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    longest = max(img.size)
    if longest > MAX_SIDE:
        scale = MAX_SIDE / longest
        img = img.resize((round(img.width * scale), round(img.height * scale)))
    arr = np.array(img)
    lines = []
    for res in _ocr.predict(arr):
        d = res if isinstance(res, dict) else dict(res)
        texts = d.get("rec_texts") or []
        scores = d.get("rec_scores") or []
        for t, s in zip(texts, scores):
            t = (t or "").strip()
            if t:
                lines.append({"text": t, "confidence": round(float(s) * 100, 1)})
    return lines


@app.get("/health")
def health():
    return jsonify(status="ok")


@app.post("/ocr")
def ocr():
    f = request.files.get("image")
    if f is None:
        return jsonify(error="multipart file field 'image' required"), 400
    try:
        lines = _extract(f.read())
    except Exception as e:  # never leak a stack trace to the caller
        app.logger.exception("ocr failed")
        return jsonify(error="ocr failed", detail=str(e)), 500
    return jsonify(lines=lines)


@app.post("/tokenize")
def tokenize():
    data = request.get_json(silent=True)
    lines = data.get("lines") if isinstance(data, dict) else None
    if not isinstance(lines, list):
        return jsonify(error="body must be { lines: string[] }"), 400
    tokens = [
        [tok for tok in word_tokenize(str(line), engine="newmm", keep_whitespace=False) if tok.strip()]
        for line in lines
    ]
    return jsonify(tokens=tokens)


if __name__ == "__main__":
    import os
    port = int(os.environ.get("OCR_PORT", "8091"))
    # threaded=False: PaddleOCR predict isn't thread-safe; scans serialize (one user in dev)
    app.run(host="127.0.0.1", port=port, threaded=False)
