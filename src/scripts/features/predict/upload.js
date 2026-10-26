/**
 * Optional Plant Photo Upload & Canvas Downscaler (Part 4)
 * - Supports drag-and-drop, click-to-browse, and mobile capture="environment"
 * - Accepts only JPEG, PNG, and WebP (verifying both MIME and magic bytes)
 * - Downscales in an offscreen <canvas> to max 1600px on the long edge and re-encodes
 *   to strip EXIF metadata and keep payloads compact.
 */

import { IMAGE_UPLOAD_CONFIG } from "../../core/config.js";

function verifyClientMagicBytes(uint8) {
  if (!uint8 || uint8.length < 12) return null;

  // JPEG: FF D8 FF
  if (uint8[0] === 0xff && uint8[1] === 0xd8 && uint8[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    uint8[0] === 0x89 &&
    uint8[1] === 0x50 &&
    uint8[2] === 0x4e &&
    uint8[3] === 0x47 &&
    uint8[4] === 0x0d &&
    uint8[5] === 0x0a &&
    uint8[6] === 0x1a &&
    uint8[7] === 0x0a
  ) {
    return "image/png";
  }

  // WebP: RIFF....WEBP
  if (
    uint8[0] === 0x52 &&
    uint8[1] === 0x49 &&
    uint8[2] === 0x46 &&
    uint8[3] === 0x46 &&
    uint8[8] === 0x57 &&
    uint8[9] === 0x45 &&
    uint8[10] === 0x42 &&
    uint8[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not decode the selected image file."));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to encode the downscaled plant photo."));
        }
      },
      mimeType,
      quality
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read encoded photo."));
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export function createPhotoUploadController() {
  const dropzone = document.getElementById("photo-dropzone");
  const fileInput = document.getElementById("plant-photo-input");
  const cameraInput = document.getElementById("plant-camera-input");
  const browseBtn = document.getElementById("photo-browse-btn");
  const cameraBtn = document.getElementById("photo-camera-btn");
  const previewBox = document.getElementById("photo-preview");
  const previewImg = document.getElementById("photo-preview-img");
  const previewName = document.getElementById("photo-preview-name");
  const previewMeta = document.getElementById("photo-preview-meta");
  const removeBtn = document.getElementById("photo-remove-btn");
  const errorEl = document.getElementById("photo-error");

  let preparedPhoto = null;

  function setError(message) {
    if (errorEl) {
      errorEl.textContent = message || "";
    }
  }

  function updateUI() {
    if (!previewBox || !dropzone) return;

    if (preparedPhoto) {
      previewImg.src = preparedPhoto.dataUrl;
      previewImg.alt = `Preview of ${preparedPhoto.name}`;
      previewName.textContent = preparedPhoto.name;
      const kb = Math.max(1, Math.round(preparedPhoto.blob.size / 1024));
      previewMeta.textContent =
        `${preparedPhoto.width} × ${preparedPhoto.height} px · ${kb} KB · EXIF stripped`;
      previewBox.hidden = false;
      dropzone.hidden = true;
    } else {
      if (previewImg) previewImg.removeAttribute("src");
      previewBox.hidden = true;
      dropzone.hidden = false;
    }
  }

  function clearPhoto() {
    preparedPhoto = null;
    if (fileInput) fileInput.value = "";
    if (cameraInput) cameraInput.value = "";
    setError("");
    updateUI();
  }

  async function processFile(file) {
    setError("");
    if (!file) return;

    if (file.size === 0) {
      setError("The selected photo file is empty.");
      return;
    }

    if (file.size > IMAGE_UPLOAD_CONFIG.MAX_RAW_FILE_BYTES) {
      setError("Please choose an image file smaller than 15 MB.");
      return;
    }

    // Check MIME and magic bytes
    const headerBuffer = await file.slice(0, 16).arrayBuffer();
    const magicMime = verifyClientMagicBytes(new Uint8Array(headerBuffer));

    if (!magicMime || !IMAGE_UPLOAD_CONFIG.ALLOWED_MIMES.includes(magicMime)) {
      setError(
        "Unsupported file type. Please upload a JPEG, PNG, or WebP plant photo."
      );
      return;
    }

    try {
      const img = await loadImageElement(file);
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      if (!origW || !origH) {
        throw new Error("Invalid image dimensions.");
      }

      const maxEdge = IMAGE_UPLOAD_CONFIG.MAX_LONG_EDGE_PX;
      const scale = Math.min(1, maxEdge / Math.max(origW, origH));
      const targetW = Math.max(1, Math.round(origW * scale));
      const targetH = Math.max(1, Math.round(origH * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas context is unavailable for image processing.");
      }

      // Fill background in case a transparent PNG is converted to JPEG
      const outputMime = magicMime === "image/png" ? "image/png" : "image/jpeg";
      if (outputMime === "image/jpeg") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, targetW, targetH);
      }

      ctx.drawImage(img, 0, 0, targetW, targetH);

      let blob = await canvasToBlob(
        canvas,
        outputMime,
        IMAGE_UPLOAD_CONFIG.JPEG_QUALITY
      );

      // If PNG output exceeds 3.5 MB, re-encode as JPEG to keep payload compact
      let finalMime = blob.type || outputMime;
      if (blob.size > 3.5 * 1024 * 1024 && finalMime !== "image/jpeg") {
        blob = await canvasToBlob(
          canvas,
          "image/jpeg",
          IMAGE_UPLOAD_CONFIG.JPEG_QUALITY
        );
        finalMime = "image/jpeg";
      }

      const dataUrl = await blobToDataUrl(blob);
      const ext = finalMime === "image/png" ? "png" : "jpg";
      const baseName = (file.name || "plant-photo").replace(/\.[^.]+$/, "");

      preparedPhoto = {
        blob,
        dataUrl,
        mimeType: finalMime,
        name: `${baseName}.${ext}`,
        width: targetW,
        height: targetH
      };

      updateUI();
    } catch (err) {
      setError(
        err.message || "Could not process the selected photo. Try another JPEG, PNG, or WebP."
      );
    }
  }

  if (dropzone) {
    dropzone.addEventListener("click", (event) => {
      if (
        event.target === browseBtn ||
        event.target === cameraBtn ||
        event.target === fileInput ||
        event.target === cameraInput
      ) {
        return;
      }
      if (fileInput) fileInput.click();
    });

    dropzone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (fileInput) fileInput.click();
      }
    });

    ["dragenter", "dragover"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropzone.classList.add("is-dragover");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((type) => {
      dropzone.addEventListener(type, (event) => {
        event.preventDefault();
        event.stopPropagation();
        dropzone.classList.remove("is-dragover");
      });
    });

    dropzone.addEventListener("drop", (event) => {
      const files = event.dataTransfer && event.dataTransfer.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
    });
  }

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      fileInput.click();
    });
  }

  if (cameraBtn && cameraInput) {
    cameraBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      cameraInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files[0]) {
        processFile(fileInput.files[0]);
      }
    });
  }

  if (cameraInput) {
    cameraInput.addEventListener("change", () => {
      if (cameraInput.files && cameraInput.files[0]) {
        processFile(cameraInput.files[0]);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", clearPhoto);
  }

  return {
    getPreparedPhoto: () => preparedPhoto,
    clearPhoto
  };
}
