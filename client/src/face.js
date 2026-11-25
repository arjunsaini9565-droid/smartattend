// Browser-side face AI built on face-api.js (TensorFlow.js). The library and models are loaded on demand
// from the URLs the server reports (local copy or CDN). Face descriptors (128 numbers) are what get stored,
// never raw video.
import { api } from './api';

let loading = null;
export const faceStatus = { ready: false };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.faceapi) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not download the face recognition library. Check your internet connection (or run "npm run vendor:face" for an offline copy).'));
    document.head.appendChild(s);
  });
}

export function loadFaceModels(onProgress = () => {}) {
  if (loading) return loading;
  loading = (async () => {
    onProgress('Loading face recognition engine...');
    const cfg = await api.get('/config');
    await loadScript(cfg.faceLibUrl);
    const f = window.faceapi;
    if (!f) throw new Error('Face recognition library failed to initialise');
    onProgress('Loading AI models (first time only)...');
    try { await f.tf.setBackend('webgl'); await f.tf.ready(); } catch { /* falls back to cpu */ }
    await Promise.all([f.nets.tinyFaceDetector.loadFromUri(cfg.faceModelsUrl), f.nets.faceLandmark68Net.loadFromUri(cfg.faceModelsUrl), f.nets.faceRecognitionNet.loadFromUri(cfg.faceModelsUrl)]);
    faceStatus.ready = true;
    return cfg;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

const detectorOptions = (input = 416, score = 0.5) => new window.faceapi.TinyFaceDetectorOptions({ inputSize: input, scoreThreshold: score });

// ---------- camera ----------
export function cameraErrorMessage(err) {
  if (!window.isSecureContext) return 'The camera only works on https:// or http://localhost. Open the app using one of those addresses.';
  switch (err && err.name) {
    case 'NotAllowedError': case 'PermissionDeniedError': return 'Camera permission was denied. Click the camera icon in the address bar, allow access, then press "Start camera" again.';
    case 'NotFoundError': case 'DevicesNotFoundError': return 'No camera was found on this device. Connect a webcam and try again.';
    case 'NotReadableError': case 'TrackStartError': return 'The camera is being used by another application. Close it and try again.';
    case 'OverconstrainedError': return 'The camera does not support the requested settings.';
    case 'SecurityError': return 'Camera access was blocked by browser security settings.';
    default: return err && err.message ? `Could not start the camera: ${err.message}` : 'Could not start the camera.';
  }
}
export async function startCamera(video, facingMode = 'user') {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error(cameraErrorMessage({ name: 'SecurityError' }));
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) { throw new Error(cameraErrorMessage(e)); }
  video.srcObject = stream;
  await new Promise((res) => { video.onloadedmetadata = res; });
  await video.play();
  return stream;
}
export const stopCamera = (stream, video) => { stream?.getTracks().forEach((t) => t.stop()); if (video) video.srcObject = null; };

// ---------- helpers ----------
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Eye Aspect Ratio from the 68-point landmarks. ~0.3 open, <0.2 closed.
export function eyeAspectRatio(landmarks) {
  const p = landmarks.positions;
  const ear = (i) => (dist(p[i + 1], p[i + 5]) + dist(p[i + 2], p[i + 4])) / (2 * dist(p[i], p[i + 3]));
  return (ear(36) + ear(42)) / 2;
}

export function thumbnail(source, box, size = 160) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const pad = box.width * 0.35; const sx = Math.max(0, box.x - pad); const sy = Math.max(0, box.y - pad);
  const sw = box.width + pad * 2; const sh = box.height + pad * 2; const s = Math.max(sw, sh);
  c.getContext('2d').drawImage(source, sx, sy, s, s, 0, 0, size, size);
  return c.toDataURL('image/jpeg', 0.8);
}

// One face -> { descriptor:number[128], photo:dataURL }. Throws friendly errors for 0 or >1 faces.
export async function describeSingleFace(source) {
  const f = window.faceapi;
  const all = await f.detectAllFaces(source, detectorOptions(512, 0.5)).withFaceLandmarks().withFaceDescriptors();
  if (all.length === 0) throw new Error('No face found. Use a clear, front-facing, well-lit photo.');
  if (all.length > 1) throw new Error('More than one face found. Use a photo with only one person.');
  const [r] = all;
  if (r.detection.box.width < 90) throw new Error('Face is too small in the photo. Move closer or use a higher resolution image.');
  return { descriptor: Array.from(r.descriptor), photo: thumbnail(source, r.detection.box) };
}

export async function fileToImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Only JPG, PNG or WebP images are supported.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Image is larger than 8 MB.');
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('Could not read this image file.')); img.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

// ---------- live recognition engine ----------
// Tracks faces across frames, requires a natural blink (liveness) from each face before asking the
// server to identify it, and reports results through callbacks.
export function createRecognizer({ video, canvas, identify, onEvent, onFps }) {
  const f = window.faceapi;
  let running = false; const tracks = []; let nextId = 1; let frames = 0; let lastFpsT = performance.now();
  const EAR_CLOSED = 0.21; const EAR_OPEN = 0.25;

  function match(det) {
    const c = { x: det.box.x + det.box.width / 2, y: det.box.y + det.box.height / 2 };
    let best = null; let bd = Infinity;
    for (const t of tracks) { const d = dist(c, t.center); if (d < bd && d < t.size * 0.8) { bd = d; best = t; } }
    if (!best) { best = { id: nextId++, state: 'watching', blinks: 0, closed: false, minEar: 1, maxEar: 0, label: 'Blink to verify', tone: 'warn', born: performance.now(), cooldown: 0 }; tracks.push(best); }
    best.center = c; best.size = det.box.width; best.box = det.box; best.seen = performance.now();
    return best;
  }

  async function verify(t) {
    t.state = 'verifying'; t.label = 'Verifying...'; t.tone = 'info';
    try {
      const all = await f.detectAllFaces(video, detectorOptions(416, 0.5)).withFaceLandmarks().withFaceDescriptors();
      let pick = null; let bd = Infinity;
      for (const r of all) { const d = dist({ x: r.detection.box.x + r.detection.box.width / 2, y: r.detection.box.y + r.detection.box.height / 2 }, t.center); if (d < bd) { bd = d; pick = r; } }
      if (!pick) { t.state = 'watching'; return; }
      const res = await identify(Array.from(pick.descriptor), { blinks: t.blinks, minEar: +t.minEar.toFixed(3), maxEar: +t.maxEar.toFixed(3) });
      onEvent(res);
      if (res.result === 'marked') { t.state = 'done'; t.label = `${res.student.name} - ${res.status}`; t.tone = 'ok'; }
      else if (res.result === 'duplicate') { t.state = 'done'; t.label = `${res.student.name} (already marked)`; t.tone = 'info'; }
      else if (res.result === 'unknown') { t.state = 'cooldown'; t.cooldown = performance.now() + 3000; t.label = 'Unknown face'; t.tone = 'bad'; }
      else { t.state = 'cooldown'; t.cooldown = performance.now() + 2500; t.label = 'Liveness failed'; t.tone = 'bad'; }
      t.blinks = 0; t.minEar = 1; t.maxEar = 0;
    } catch (e) {
      t.state = 'cooldown'; t.cooldown = performance.now() + 4000; t.label = 'Error - retrying'; t.tone = 'bad';
      onEvent({ result: 'error', message: e.message || 'Recognition request failed' });
    }
  }

  function draw() {
    const ctx = canvas.getContext('2d'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const colors = { ok: '#16a34a', warn: '#f59e0b', bad: '#dc2626', info: '#2563eb' };
    for (const t of tracks) {
      const { x, y, width: w, height: h } = t.box; const col = colors[t.tone] || '#2563eb';
      ctx.lineWidth = Math.max(3, canvas.width / 220); ctx.strokeStyle = col; ctx.strokeRect(x, y, w, h);
      const fs = Math.max(14, canvas.width / 42); ctx.font = `600 ${fs}px system-ui, sans-serif`;
      // canvas is mirrored with the video through CSS, so draw text un-mirrored
      ctx.save(); ctx.translate(x + w, y - 6); ctx.scale(-1, 1);
      const tw = ctx.measureText(t.label).width + 14; ctx.fillStyle = col; ctx.fillRect(0, -fs - 4, tw, fs + 10); ctx.fillStyle = '#fff'; ctx.fillText(t.label, 7, 0); ctx.restore();
    }
  }

  async function loop() {
    while (running) {
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          const dets = await f.detectAllFaces(video, detectorOptions(320, 0.55)).withFaceLandmarks();
          const now = performance.now(); const seenNow = new Set();
          for (const d of dets) {
            const t = match(d.detection); seenNow.add(t.id);
            if (d.detection.box.width < video.videoWidth * 0.12) { t.label = 'Move closer'; t.tone = 'warn'; continue; }
            if (t.state === 'cooldown' && now > t.cooldown) { t.state = 'watching'; }
            if (t.state === 'watching') {
              const ear = eyeAspectRatio(d.landmarks);
              t.minEar = Math.min(t.minEar, ear); t.maxEar = Math.max(t.maxEar, ear);
              if (ear < EAR_CLOSED) t.closed = true;
              else if (ear > EAR_OPEN && t.closed) { t.closed = false; t.blinks++; }
              if (t.blinks >= 1) verify(t); else { t.label = 'Blink to verify'; t.tone = 'warn'; }
            }
          }
          for (let i = tracks.length - 1; i >= 0; i--) if (performance.now() - tracks[i].seen > 1500 && tracks[i].state !== 'verifying') tracks.splice(i, 1);
          draw();
          frames++; if (now - lastFpsT > 1000) { onFps(Math.round((frames * 1000) / (now - lastFpsT))); frames = 0; lastFpsT = now; }
        } catch (e) { onEvent({ result: 'error', message: 'Face detection error: ' + (e.message || e) }); await new Promise((r) => setTimeout(r, 1500)); }
      }
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  return { start() { if (running) return; running = true; loop(); }, stop() { running = false; tracks.length = 0; canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); } };
}
