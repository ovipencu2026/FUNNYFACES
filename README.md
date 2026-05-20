# FUNNYFACES

A small web app for weddings and events. Create an event, print or share its QR code, and guests can upload funny photos, candid moments, and short videos from their phones.

## Run

Use the bundled Python runtime in this Codex workspace:

```powershell
& 'C:\Users\ovidiu.pencu\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' server.py
```

Open `http://localhost:8000` on the computer running the app.

For phones, use the LAN URL printed in the terminal, usually something like `http://192.168.x.x:8000`. The computer and phones must be on the same Wi-Fi network.

## What It Does

- Creates separate event pages.
- Generates a QR code for each event.
- Lets guests upload multiple photos or videos.
- Stores files under `uploads/<event-slug>/`.
- Shows an event gallery for the organizer.
- Shows your logo as a subtle page background when you add it as `static/logo.png`.

## Launch Online

The app is ready for a simple Python web service host.

Build command:

```text
pip install -r requirements.txt
```

Start command:

```text
python server.py
```

The app reads the hosting provider's `PORT` environment variable automatically.

For production, configure persistent storage so event data and uploaded files survive redeploys:

```text
STORAGE_DIR=/path/to/persistent/storage
```

## Production Notes

This is still a lightweight MVP. Before using FUNNYFACES for paid events, add organizer login, cloud backups, stronger media validation, and a privacy policy.
