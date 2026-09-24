#!/usr/bin/env python3
"""Runs only AFTER hash-bound clean scan, inside mandatory OS sandbox. No actions."""
import io
import json
import posixpath
import resource
import sys
import zipfile
import xml.etree.ElementTree as ET

resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
# macOS does not support lowering RLIMIT_AS reliably. The parent bounds time
# and output; per-format byte/page/container limits remain mandatory.
if sys.platform != "darwin":
    resource.setrlimit(resource.RLIMIT_AS, (768 * 1024**2, 768 * 1024**2))
LIMIT = 512 * 1024
kind, path = sys.argv[1:]
with open(path, "rb") as source:
    data = source.read(20 * 1024**2 + 1)
if len(data) > 20 * 1024**2:
    raise ValueError("size_limit")
if kind == "pdf":
    if not data.startswith(b"%PDF-"):
        raise ValueError("pdf_signature")
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data), strict=True)
    if reader.is_encrypted or len(reader.pages) > 100:
        raise ValueError("encrypted_or_page_limit")
    import pdfplumber
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        pages = []
        for i, page in enumerate(pdf.pages):
            # Rotated COPY watermarks are decoration, not booking-table cells.
            # Retain horizontal text and its geometry for deterministic columns.
            horizontal = page.filter(lambda obj: obj.get("object_type") != "char" or
                (abs(obj.get("matrix", [1, 0, 0, 1])[1]) < 0.01 and
                 abs(obj.get("matrix", [1, 0, 0, 1])[2]) < 0.01))
            page_text = horizontal.extract_text(layout=True) or ""
            pages.append(f"[Page {i+1}]\n" + "\n".join(line.rstrip() for line in page_text.splitlines() if line.strip()))
        text = "\n\n".join(pages)
elif kind == "xlsx":
    # Cell values only. No formulas, links, macros, embedded objects or Excel engine.
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = [x.filename for x in entries]
        if len(entries) > 500 or len(set(names)) != len(names) or sum(x.file_size for x in entries) > 40 * 1024**2:
            raise ValueError("archive_limit")
        if any(".." in x.filename.split("/") or x.filename.startswith("/") or x.flag_bits & 1 or any(k in x.filename.lower() for k in ["vba", "embeddings/", "externallinks/"]) for x in entries):
            raise ValueError("active_or_unsafe_container")
        def xml(name):
            raw = archive.read(name)
            raw.decode("utf-8-sig")  # reject alternative encodings before entity checks
            if len(raw) > 8 * 1024**2 or b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
                raise ValueError("xml_limit_or_entity")
            return ET.fromstring(raw)
        for name in names:
            if name.endswith(".rels") and any(x.get("TargetMode") == "External" for x in xml(name)):
                raise ValueError("external_workbook_relationship")
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        rid = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        shared = ["".join(x.text or "" for x in si.iter(ns+"t")) for si in xml("xl/sharedStrings.xml").iter(ns+"si")] if "xl/sharedStrings.xml" in names else []
        rels = {r.get("Id"): r.get("Target") for r in xml("xl/_rels/workbook.xml.rels")}
        sheets = []
        count = 0
        for sheet in xml("xl/workbook.xml").iter(ns+"sheet"):
            target = rels.get(sheet.get(rid), "")
            name = posixpath.normpath(posixpath.join("xl", target)) if not target.startswith("/") else target.lstrip("/")
            if not name.startswith("xl/worksheets/") or name not in names:
                raise ValueError("invalid_sheet_target")
            rows = []
            for row in xml(name).iter(ns+"row"):
                cells = []
                for cell in row.findall(ns+"c"):
                    count += 1
                    if count > 30000 or cell.find(ns+"f") is not None:
                        raise ValueError("cell_limit_or_formula")
                    typ = cell.get("t", "n")
                    val = cell.findtext(ns+"v", "")
                    if typ == "s":
                        index = int(val)
                        if index < 0 or index >= len(shared):
                            raise ValueError("invalid_shared_string")
                        val = shared[index]
                    elif typ == "inlineStr":
                        val = "".join(t.text or "" for t in cell.iter(ns+"t"))
                    if val:
                        cells.append({"ref": cell.get("r"), "type": typ, "value": val})
                if cells:
                    rows.append({"row": int(row.get("r", "0")), "cells": cells})
            sheets.append({"name": sheet.get("name"), "rows": rows})
        if not sheets or len(sheets) > 30:
            raise ValueError("sheet_limit")
        text = json.dumps({"schema": "folio/xlsx-values/v1", "sheets": sheets}, ensure_ascii=False)
elif kind == "docx":
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 500 or sum(x.file_size for x in entries) > 40 * 1024**2:
            raise ValueError("archive_limit")
        if any(".." in x.filename.split("/") or x.filename.startswith("/") or x.flag_bits & 1 or "vba" in x.filename.lower() or "embeddings/" in x.filename.lower() for x in entries):
            raise ValueError("active_or_unsafe_container")
        xml = archive.read("word/document.xml")
        if len(xml) > 4 * 1024**2 or b"<!DOCTYPE" in xml or b"<!ENTITY" in xml:
            raise ValueError("xml_limit_or_entity")
        root = ET.fromstring(xml)
        ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        text = "\n".join("".join(x.text or "" for x in p.iter(ns + "t")) for p in root.iter(ns + "p"))
elif kind in ("csv", "camt", "text"):
    if b"\x00" in data:
        raise ValueError("binary_text")
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        if kind != "csv":
            raise
        text = data.decode("cp1252")
    if kind == "camt" and ("<!DOCTYPE" in text or "<!ENTITY" in text):
        raise ValueError("xml_entity")
else:
    raise ValueError("unsupported_format")
if not text.strip() or len(text.encode("utf-8")) > LIMIT:
    raise ValueError("empty_or_text_limit")
sys.stdout.write(text)
