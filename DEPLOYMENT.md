# Launch FUNNYFACES Online

## Recommended Simple Launch: Render

1. Create a GitHub repository and push this folder.
2. In Render, create a new Web Service from the repository.
3. Use these settings:
   - Runtime: Python
   - Build command: `pip install -r requirements.txt`
   - Start command: `python server.py`
4. Add a persistent disk for uploads and event data.
5. Add this environment variable:
   - `STORAGE_DIR=/opt/render/project/src/storage`
6. Deploy, open the public URL, create an event, and use the generated QR code.

## Alternative: Railway

1. Create a new Railway project from the GitHub repository.
2. Use `python server.py` as the start command if Railway does not detect the `Procfile`.
3. Railway provides the `PORT` variable automatically; FUNNYFACES already listens on it.
4. Add persistent storage or replace local storage with cloud object storage before real events.

## Important

Local filesystem uploads can disappear on many free or ephemeral hosts after redeploys. For real events, use a provider with persistent disks or switch uploads to S3-compatible storage.
