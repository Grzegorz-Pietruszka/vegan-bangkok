import sys, json
from paddleocr import PaddleOCR

img = sys.argv[1]
ocr = PaddleOCR(lang='th', use_textline_orientation=True)

# PaddleOCR 3.x: predict() returns result objects carrying rec_texts + rec_scores
res = ocr.predict(img)
lines = []
for r in res:
    d = r if isinstance(r, dict) else getattr(r, 'json', {}).get('res', {}) or dict(r)
    texts = d.get('rec_texts') or []
    scores = d.get('rec_scores') or []
    for t, s in zip(texts, scores):
        lines.append({'text': t, 'confidence': round(float(s) * 100, 1)})

print("=== PaddleOCR Thai — %d lines ===" % len(lines))
for l in lines:
    print("c%5.1f | %s" % (l['confidence'], l['text']))
