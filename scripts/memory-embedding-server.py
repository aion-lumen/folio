#!/usr/bin/env python3
"""Optional local CPU embedding service. No downloads or cloud calls while serving.

Implements the E5 model card's masked mean pooling and L2 normalization.
The Folio client supplies query:/passage: prefixes. No request text is logged.
"""
import argparse
import hashlib
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.request import urlopen

MODEL = "intfloat/multilingual-e5-small"
REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
MODEL_ID = f"{MODEL}@{REVISION}/qint8"
FILES = {
    "model_qint8_avx512_vnni.onnx": ("onnx/model_qint8_avx512_vnni.onnx", "dd476dd0c2514e9b9be83aeb3853fac0763e0bdf4a71645407587d77c48a2d88"),
    "tokenizer.json": ("tokenizer.json", "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39"),
}


def verify(path, expected):
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != expected:
        raise ValueError(f"Pinned model checksum mismatch: {path.name}")


def download(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name, (remote, digest) in FILES.items():
        dest = directory / name
        if not dest.exists():
            temp = directory / (name + ".partial")
            with urlopen(f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{remote}", timeout=120) as response, temp.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            verify(temp, digest)
            temp.replace(dest)
        verify(dest, digest)
    print(json.dumps({"downloaded": str(directory), "model": MODEL_ID}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--port", type=int, default=1235)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--download", action="store_true", help="Download the pinned public model and exit.")
    args = parser.parse_args()
    if args.download:
        download(args.model_dir)
        return
    for name, (_, digest) in FILES.items():
        verify(args.model_dir / name, digest)
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    import numpy as np
    import onnxruntime as ort
    from tokenizers import Tokenizer

    ort.disable_telemetry_events()

    tokenizer = Tokenizer.from_file(str(args.model_dir / "tokenizer.json"))
    tokenizer.enable_truncation(max_length=512)
    tokenizer.enable_padding(pad_id=1, pad_token="<pad>")
    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1, min(4, args.threads))
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(args.model_dir / "model_qint8_avx512_vnni.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
    input_names = {item.name for item in session.get_inputs()}

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(5)

        def log_message(self, *_args):
            pass

        def reply(self, status, payload):
            data = json.dumps(payload, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/health":
                self.reply(200, {"model": MODEL_ID, "revision": REVISION, "dimensions": 384, "provider": "CPUExecutionProvider"})
            else:
                self.reply(404, {"error": "unknown path"})

        def do_POST(self):
            if self.path != "/v1/embeddings":
                return self.reply(404, {"error": "unknown path"})
            if self.headers.get("Origin") or self.headers.get_content_type() != "application/json":
                return self.reply(403, {"error": "server-to-server JSON requests only"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 1000000:
                    raise ValueError("invalid body size")
                body = json.loads(self.rfile.read(length))
                texts = body.get("input")
                if body.get("model") != MODEL_ID or not isinstance(texts, list) or not 1 <= len(texts) <= 16:
                    raise ValueError("invalid model or batch")
                if any(not isinstance(t, str) or not t.strip() or len(t) > 12100 for t in texts):
                    raise ValueError("invalid input")
                encoded = tokenizer.encode_batch(texts)
                ids = np.array([t.ids for t in encoded], dtype=np.int64)
                mask = np.array([t.attention_mask for t in encoded], dtype=np.int64)
                inputs = {"input_ids": ids, "attention_mask": mask}
                if "token_type_ids" in input_names:
                    inputs["token_type_ids"] = np.zeros_like(ids)
                hidden = session.run(None, inputs)[0]
                if hidden.ndim != 3 or hidden.shape[2] != 384:
                    raise RuntimeError("unexpected model output")
                vectors = (hidden * mask[..., None]).sum(axis=1) / mask.sum(axis=1, keepdims=True)
                vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
                self.reply(200, {"object": "list", "model": MODEL_ID, "data": [
                    {"object": "embedding", "index": i, "embedding": v.tolist()} for i, v in enumerate(vectors)
                ]})
            except (ValueError, TypeError, KeyError):
                self.reply(400, {"error": "invalid embedding request"})
            except Exception:
                self.reply(503, {"error": "local embedding unavailable"})

    server = HTTPServer(("127.0.0.1", args.port), Handler)
    print(json.dumps({"listening": f"http://127.0.0.1:{args.port}", "model": MODEL_ID, "threads": options.intra_op_num_threads}), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
