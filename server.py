from __future__ import annotations

import cgi
import html
import json
import os
import re
import socket
import sys
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from PIL import Image
try:
    import qrcode
except ImportError:
    qrcode = None


ROOT = Path(__file__).resolve().parent
APP_NAME = "FUNNYFACES"
STORAGE_ROOT = Path(os.environ.get("STORAGE_DIR", ROOT)).resolve()
DATA_DIR = STORAGE_ROOT / "data"
UPLOAD_DIR = STORAGE_ROOT / "uploads"
EVENTS_FILE = DATA_DIR / "events.json"
MAX_UPLOAD_BYTES = 80 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".mov", ".mp4"}


def ensure_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if not EVENTS_FILE.exists():
        EVENTS_FILE.write_text("[]", encoding="utf-8")


def load_events() -> list[dict]:
    ensure_storage()
    return json.loads(EVENTS_FILE.read_text(encoding="utf-8"))


def save_events(events: list[dict]) -> None:
    ensure_storage()
    EVENTS_FILE.write_text(json.dumps(events, indent=2), encoding="utf-8")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"event-{int(time.time())}"


def unique_slug(base: str, events: list[dict]) -> str:
    existing = {event["slug"] for event in events}
    slug = base
    counter = 2
    while slug in existing:
        slug = f"{base}-{counter}"
        counter += 1
    return slug


def event_by_slug(slug: str) -> dict | None:
    return next((event for event in load_events() if event["slug"] == slug), None)


def get_host_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def guess_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("Host")
    forwarded_proto = handler.headers.get("X-Forwarded-Proto")
    proto = forwarded_proto.split(",")[0].strip() if forwarded_proto else "http"
    if host:
        return f"{proto}://{host}"
    return f"http://{get_host_ip()}:8000"


def event_link(handler: BaseHTTPRequestHandler, event: dict) -> str:
    return f"{guess_base_url(handler)}/e/{quote(event['slug'])}"


def photo_records(slug: str) -> list[dict]:
    directory = UPLOAD_DIR / slug
    if not directory.exists():
        return []
    records = []
    for path in sorted(directory.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
        if not path.is_file() or path.name.startswith("."):
            continue
        records.append(
            {
                "name": path.name,
                "url": f"/uploads/{quote(slug)}/{quote(path.name)}",
                "uploaded": time.strftime("%Y-%m-%d %H:%M", time.localtime(path.stat().st_mtime)),
                "size": path.stat().st_size,
                "is_video": path.suffix.lower() in {".mov", ".mp4"},
            }
        )
    return records


def render_page(title: str, body: str, extra_head: str = "") -> bytes:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <link rel="stylesheet" href="/static/app.css">
  {extra_head}
</head>
<body>
{body}
</body>
</html>""".encode("utf-8")


class QRCodeV5L:
    size = 37
    version = 5
    data_codewords = 108
    ec_codewords = 26

    def __init__(self, text: str):
        data = text.encode("utf-8")
        if len(data) > 106:
            raise ValueError("QR payload is too long for the built-in generator.")
        self.modules: list[list[bool | None]] = [[None] * self.size for _ in range(self.size)]
        self.function: list[list[bool]] = [[False] * self.size for _ in range(self.size)]
        self._draw_function_patterns()
        codewords = self._make_codewords(data)
        raw_bits = [((byte >> shift) & 1) == 1 for byte in codewords for shift in range(7, -1, -1)]
        self._draw_codewords(raw_bits)
        mask = self._best_mask()
        self._apply_mask(mask)
        self._draw_format_bits(mask)

    def _set_function(self, x: int, y: int, value: bool) -> None:
        if 0 <= x < self.size and 0 <= y < self.size:
            self.modules[y][x] = value
            self.function[y][x] = True

    def _draw_function_patterns(self) -> None:
        for x in range(self.size):
            self._set_function(x, 6, x % 2 == 0)
        for y in range(self.size):
            self._set_function(6, y, y % 2 == 0)
        self._draw_finder(3, 3)
        self._draw_finder(self.size - 4, 3)
        self._draw_finder(3, self.size - 4)
        self._draw_alignment(30, 30)
        self._set_function(8, self.size - 8, True)
        for i in range(9):
            self._set_function(8, i, False)
            self._set_function(i, 8, False)
            self._set_function(self.size - 1 - i, 8, False)
            self._set_function(8, self.size - 1 - i, False)

    def _draw_finder(self, cx: int, cy: int) -> None:
        for dy in range(-4, 5):
            for dx in range(-4, 5):
                x, y = cx + dx, cy + dy
                dist = max(abs(dx), abs(dy))
                self._set_function(x, y, dist not in {2, 4})

    def _draw_alignment(self, cx: int, cy: int) -> None:
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                self._set_function(cx + dx, cy + dy, max(abs(dx), abs(dy)) != 1)

    def _make_codewords(self, data: bytes) -> list[int]:
        bits = [False, True, False, False]
        bits.extend(((len(data) >> shift) & 1) == 1 for shift in range(7, -1, -1))
        for byte in data:
            bits.extend(((byte >> shift) & 1) == 1 for shift in range(7, -1, -1))
        bits.extend([False] * min(4, self.data_codewords * 8 - len(bits)))
        while len(bits) % 8:
            bits.append(False)
        data_words = [sum((1 << (7 - i)) for i, bit in enumerate(bits[j : j + 8]) if bit) for j in range(0, len(bits), 8)]
        pads = [0xEC, 0x11]
        while len(data_words) < self.data_codewords:
            data_words.append(pads[len(data_words) % 2])
        return data_words + self._reed_solomon(data_words, self.ec_codewords)

    @staticmethod
    def _gf_multiply(x: int, y: int) -> int:
        result = 0
        while y:
            if y & 1:
                result ^= x
            x <<= 1
            if x & 0x100:
                x ^= 0x11D
            y >>= 1
        return result

    def _reed_solomon(self, data: list[int], degree: int) -> list[int]:
        generator = [1]
        root = 1
        for _ in range(degree):
            generator = [self._gf_multiply(coef, root) for coef in generator] + [0]
            for i in range(len(generator) - 1):
                generator[i + 1] ^= generator[i]
            root = self._gf_multiply(root, 2)
        remainder = [0] * degree
        for byte in data:
            factor = byte ^ remainder.pop(0)
            remainder.append(0)
            for i, coef in enumerate(generator[1:]):
                remainder[i] ^= self._gf_multiply(coef, factor)
        return remainder

    def _draw_codewords(self, bits: list[bool]) -> None:
        index = 0
        upward = True
        x = self.size - 1
        while x > 0:
            if x == 6:
                x -= 1
            for row in range(self.size):
                y = self.size - 1 - row if upward else row
                for dx in range(2):
                    xx = x - dx
                    if not self.function[y][xx]:
                        self.modules[y][xx] = bits[index] if index < len(bits) else False
                        index += 1
            upward = not upward
            x -= 2

    @staticmethod
    def _mask_bit(mask: int, x: int, y: int) -> bool:
        return [
            (x + y) % 2 == 0,
            y % 2 == 0,
            x % 3 == 0,
            (x + y) % 3 == 0,
            (x // 3 + y // 2) % 2 == 0,
            (x * y) % 2 + (x * y) % 3 == 0,
            ((x * y) % 2 + (x * y) % 3) % 2 == 0,
            ((x + y) % 2 + (x * y) % 3) % 2 == 0,
        ][mask]

    def _apply_mask(self, mask: int) -> None:
        for y in range(self.size):
            for x in range(self.size):
                if not self.function[y][x] and self._mask_bit(mask, x, y):
                    self.modules[y][x] = not self.modules[y][x]

    def _best_mask(self) -> int:
        original = [row[:] for row in self.modules]
        best_mask = 0
        best_score = sys.maxsize
        for mask in range(8):
            self.modules = [row[:] for row in original]
            self._apply_mask(mask)
            score = self._penalty()
            if score < best_score:
                best_mask, best_score = mask, score
        self.modules = original
        return best_mask

    def _penalty(self) -> int:
        score = 0
        rows = self.modules
        columns = [[rows[y][x] for y in range(self.size)] for x in range(self.size)]
        for line in rows + columns:
            run_color = line[0]
            run_len = 1
            for color in line[1:]:
                if color == run_color:
                    run_len += 1
                    if run_len == 5:
                        score += 3
                    elif run_len > 5:
                        score += 1
                else:
                    run_color = color
                    run_len = 1
        for y in range(self.size - 1):
            for x in range(self.size - 1):
                color = self.modules[y][x]
                if all(self.modules[y + dy][x + dx] == color for dy in range(2) for dx in range(2)):
                    score += 3
        dark = sum(1 for row in self.modules for cell in row if cell)
        percent = dark * 100 // (self.size * self.size)
        score += abs(percent - 50) // 5 * 10
        return score

    def _draw_format_bits(self, mask: int) -> None:
        data = (1 << 3) | mask
        bits = data << 10
        generator = 0x537
        for i in range(14, 9, -1):
            if (bits >> i) & 1:
                bits ^= generator << (i - 10)
        format_bits = ((data << 10) | bits) ^ 0x5412
        for i in range(15):
            bit = ((format_bits >> i) & 1) == 1
            if i < 6:
                self._set_function(8, i, bit)
            elif i < 8:
                self._set_function(8, i + 1, bit)
            else:
                self._set_function(14 - i, 8, bit)
            if i < 8:
                self._set_function(self.size - 1 - i, 8, bit)
            else:
                self._set_function(8, self.size - 15 + i, bit)
        self._set_function(8, self.size - 8, True)

    def to_png(self, scale: int = 10, border: int = 4) -> bytes:
        pixels = (self.size + border * 2) * scale
        image = Image.new("RGB", (pixels, pixels), "white")
        for y, row in enumerate(self.modules):
            for x, value in enumerate(row):
                if value:
                    for py in range((y + border) * scale, (y + border + 1) * scale):
                        for px in range((x + border) * scale, (x + border + 1) * scale):
                            image.putpixel((px, py), (12, 19, 28))
        from io import BytesIO

        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return buffer.getvalue()


class EventHandler(BaseHTTPRequestHandler):
    server_version = "FunnyFaces/1.0"

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            self.show_home()
        elif path.startswith("/e/"):
            self.show_upload(unquote(path.removeprefix("/e/")))
        elif path.startswith("/gallery/"):
            self.show_gallery(unquote(path.removeprefix("/gallery/")))
        elif path.startswith("/qr/") and path.endswith(".png"):
            self.show_qr(unquote(path.removeprefix("/qr/").removesuffix(".png")))
        elif path.startswith("/uploads/"):
            self.serve_upload(path)
        elif path.startswith("/static/"):
            self.serve_static(path)
        else:
            self.error_page(HTTPStatus.NOT_FOUND, "Page not found")

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path == "/events":
            self.create_event()
        elif path.startswith("/api/events/") and path.endswith("/photos"):
            slug = unquote(path.removeprefix("/api/events/").removesuffix("/photos"))
            self.upload_photos(slug)
        else:
            self.error_page(HTTPStatus.NOT_FOUND, "Endpoint not found")

    def show_home(self) -> None:
        events = load_events()
        cards = []
        for event in events:
            link = event_link(self, event)
            cards.append(
                f"""
        <article class="event-card">
          <div>
            <p class="eyebrow">{html.escape(event.get("date", "Event"))}</p>
            <h2>{html.escape(event["name"])}</h2>
            <p>{len(photo_records(event["slug"]))} uploads</p>
          </div>
          <img src="/qr/{quote(event['slug'])}.png" alt="QR code for {html.escape(event['name'])}">
          <div class="actions">
            <a class="button" href="/e/{quote(event['slug'])}">Guest page</a>
            <a class="button secondary" href="/gallery/{quote(event['slug'])}">Gallery</a>
          </div>
          <input readonly value="{html.escape(link)}" onclick="this.select()">
        </article>"""
            )
        if not cards:
            cards.append('<p class="empty">Create your first event to get a scannable QR code.</p>')
        body = f"""
<main class="shell">
  <section class="hero">
    <div>
      <p class="eyebrow">Wedding and event photo sharing</p>
      <h1>FUNNYFACES</h1>
      <p class="lead">Guest photos and videos, collected through one QR code for weddings, parties, and private events.</p>
    </div>
    <form class="create-form" method="post" action="/events">
      <label>Event name<input name="name" placeholder="Ana & Mihai Wedding" required></label>
      <label>Date or note<input name="date" placeholder="19 May 2026"></label>
      <button type="submit">Create event</button>
    </form>
  </section>
  <section class="events-grid">
    {''.join(cards)}
  </section>
</main>"""
        self.respond(render_page(APP_NAME, body), "text/html; charset=utf-8")

    def create_event(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        values = parse_qs(self.rfile.read(length).decode("utf-8"))
        name = values.get("name", [""])[0].strip()
        date = values.get("date", [""])[0].strip()
        if not name:
            self.error_page(HTTPStatus.BAD_REQUEST, "Event name is required")
            return
        events = load_events()
        slug = unique_slug(slugify(name), events)
        events.append({"name": name, "date": date, "slug": slug, "created_at": int(time.time())})
        save_events(events)
        (UPLOAD_DIR / slug).mkdir(parents=True, exist_ok=True)
        self.redirect(f"/gallery/{quote(slug)}")

    def show_upload(self, slug: str) -> None:
        event = event_by_slug(slug)
        if not event:
            self.error_page(HTTPStatus.NOT_FOUND, "Event not found")
            return
        body = f"""
<main class="upload-screen">
  <section class="upload-panel">
    <p class="eyebrow">{html.escape(event.get("date") or "Event photos")}</p>
    <h1>{html.escape(event["name"])}</h1>
    <form id="uploadForm" class="drop-zone">
      <input id="photos" name="photos" type="file" accept="image/*,video/mp4,video/quicktime" multiple required>
      <label for="photos">
        <span class="upload-icon">+</span>
        <strong>Add photos or videos</strong>
        <small>Choose from your phone gallery or camera</small>
      </label>
      <button type="submit">Upload selected files</button>
    </form>
    <div id="status" class="status" role="status"></div>
  </section>
</main>
<script>
  window.EVENT_SLUG = {json.dumps(slug)};
</script>
<script src="/static/app.js"></script>"""
        self.respond(render_page(event["name"], body), "text/html; charset=utf-8")

    def upload_photos(self, slug: str) -> None:
        if not event_by_slug(slug):
            self.error_json(HTTPStatus.NOT_FOUND, "Event not found")
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_UPLOAD_BYTES:
            self.error_json(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Upload is too large")
            return
        form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={"REQUEST_METHOD": "POST"})
        files = form["photos"] if "photos" in form else []
        if not isinstance(files, list):
            files = [files]
        target = UPLOAD_DIR / slug
        target.mkdir(parents=True, exist_ok=True)
        saved = []
        for item in files:
            if not item.filename:
                continue
            original = Path(item.filename).name
            extension = Path(original).suffix.lower()
            if extension not in ALLOWED_EXTENSIONS:
                continue
            filename = f"{int(time.time())}-{uuid.uuid4().hex[:8]}{extension}"
            path = target / filename
            with path.open("wb") as output:
                output.write(item.file.read())
            saved.append(filename)
        if not saved:
            self.error_json(HTTPStatus.BAD_REQUEST, "No valid photo or video files were uploaded")
            return
        self.respond_json({"ok": True, "saved": saved})

    def show_gallery(self, slug: str) -> None:
        event = event_by_slug(slug)
        if not event:
            self.error_page(HTTPStatus.NOT_FOUND, "Event not found")
            return
        photos = photo_records(slug)
        link = event_link(self, event)
        tiles = []
        for photo in photos:
            if photo["is_video"]:
                media = f'<video src="{photo["url"]}" controls muted></video>'
            else:
                media = f'<img src="{photo["url"]}" alt="Uploaded event photo">'
            tiles.append(f'<article class="photo-tile">{media}<span>{photo["uploaded"]}</span></article>')
        if not tiles:
            tiles.append('<p class="empty">No uploads yet. Share the QR code and this gallery will fill up.</p>')
        body = f"""
<main class="shell">
  <nav class="topbar"><a href="/">All events</a><a href="/e/{quote(slug)}">Guest upload page</a></nav>
  <section class="gallery-head">
    <div>
      <p class="eyebrow">{html.escape(event.get("date") or "Gallery")}</p>
      <h1>{html.escape(event["name"])}</h1>
      <p class="lead">{len(photos)} uploaded file{'s' if len(photos) != 1 else ''}</p>
    </div>
    <div class="qr-card">
      <img src="/qr/{quote(slug)}.png" alt="QR code">
      <input readonly value="{html.escape(link)}" onclick="this.select()">
    </div>
  </section>
  <section class="photo-grid">{''.join(tiles)}</section>
</main>"""
        self.respond(render_page(f"{event['name']} Gallery", body), "text/html; charset=utf-8")

    def show_qr(self, slug: str) -> None:
        event = event_by_slug(slug)
        if not event:
            self.error_page(HTTPStatus.NOT_FOUND, "Event not found")
            return
        if qrcode:
            from io import BytesIO

            image = qrcode.make(event_link(self, event))
            buffer = BytesIO()
            image.save(buffer, format="PNG")
            self.respond(buffer.getvalue(), "image/png")
            return
        try:
            png = QRCodeV5L(event_link(self, event)).to_png()
        except ValueError:
            png = QRCodeV5L(f"/e/{event['slug']}").to_png()
        self.respond(png, "image/png")

    def serve_upload(self, path: str) -> None:
        parts = [unquote(part) for part in path.split("/") if part]
        if len(parts) != 3:
            self.error_page(HTTPStatus.NOT_FOUND, "File not found")
            return
        _, slug, filename = parts
        file_path = (UPLOAD_DIR / slug / filename).resolve()
        if not str(file_path).startswith(str(UPLOAD_DIR.resolve())) or not file_path.exists():
            self.error_page(HTTPStatus.NOT_FOUND, "File not found")
            return
        self.respond(file_path.read_bytes(), self.mime_type(file_path))

    def serve_static(self, path: str) -> None:
        file_path = (ROOT / path.lstrip("/")).resolve()
        if not str(file_path).startswith(str((ROOT / "static").resolve())) or not file_path.exists():
            self.error_page(HTTPStatus.NOT_FOUND, "Asset not found")
            return
        self.respond(file_path.read_bytes(), self.mime_type(file_path))

    @staticmethod
    def mime_type(path: Path) -> str:
        return {
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
        }.get(path.suffix.lower(), "application/octet-stream")

    def redirect(self, location: str) -> None:
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", location)
        self.end_headers()

    def respond(self, body: bytes, content_type: str) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def respond_json(self, data: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def error_json(self, status: HTTPStatus, message: str) -> None:
        self.respond_json({"ok": False, "error": message}, status)

    def error_page(self, status: HTTPStatus, message: str) -> None:
        body = render_page("Error", f'<main class="shell"><p class="empty">{html.escape(message)}</p></main>')
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    ensure_storage()
    port = int(os.environ.get("PORT", "8000"))
    host = os.environ.get("HOST", "0.0.0.0")
    server = ThreadingHTTPServer((host, port), EventHandler)
    print(f"{APP_NAME} running at http://localhost:{port}")
    print(f"Phone-friendly LAN URL is usually http://{get_host_ip()}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
