"""Render a bounded page image inside Folio's existing no-network sandbox."""
import json
import sys
import pypdfium2 as pdfium

page_number = int(sys.argv[1])
document = pdfium.PdfDocument("input.pdf")
if not 1 <= page_number <= min(len(document), 500):
    raise ValueError("page_out_of_range")
page = document[page_number - 1]
width, height = page.get_size()
if not 1 <= width <= 20000 or not 1 <= height <= 20000:
    raise ValueError("page_dimensions")
bitmap = page.render(scale=min(2, 1600 / width, 2200 / height))
bitmap.to_pil().convert("RGB").save("page.jpg", quality=88)
print(json.dumps({"pages": min(len(document), 500)}))
bitmap.close()
page.close()
document.close()
