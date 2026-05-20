const form = document.querySelector("#uploadForm");
const input = document.querySelector("#photos");
const statusBox = document.querySelector("#status");
const recentUploads = document.querySelector("#recentUploads");

function setStatus(message) {
  statusBox.textContent = message;
}

function renderPhotos(photos) {
  if (!recentUploads) return;
  if (!photos.length) {
    recentUploads.innerHTML = '<p class="empty">No uploads are visible yet. Add a photo and it will appear here.</p>';
    return;
  }

  recentUploads.innerHTML = photos
    .slice(0, 8)
    .map((photo) => {
      const media = photo.is_video
        ? `<video src="${photo.url}" controls muted></video>`
        : `<img src="${photo.url}" alt="Uploaded event photo">`;
      return `<article class="photo-tile">${media}<span>${photo.uploaded}</span></article>`;
    })
    .join("");
}

input?.addEventListener("change", () => {
  const count = input.files.length;
  setStatus(count ? `${count} file${count === 1 ? "" : "s"} selected` : "");
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!input.files.length) {
    setStatus("Choose at least one file first.");
    return;
  }

  const data = new FormData();
  for (const file of input.files) {
    data.append("photos", file);
  }

  const button = form.querySelector("button");
  button.disabled = true;
  setStatus("Uploading...");

  try {
    const response = await fetch(`/api/events/${encodeURIComponent(window.EVENT_SLUG)}/photos`, {
      method: "POST",
      body: data,
      headers: {
        "X-Requested-With": "fetch",
      },
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Upload failed");
    }
    input.value = "";
    setStatus(`Uploaded ${result.saved.length} file${result.saved.length === 1 ? "" : "s"}. Thank you!`);
    renderPhotos(result.photos || []);
  } catch (error) {
    setStatus(error.message);
  } finally {
    button.disabled = false;
  }
});
