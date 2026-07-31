import { FileReceiver, FileSender } from "./generated/core/transfer.js";
import { decodeOpticalFrame, PROFILES, renderOpticalFrame } from "./generated/core/optical-frame.js";

const $ = (id) => document.getElementById(id);
const state = { mode: "send", sender: null, senderFrame: 0, senderStarted: 0, senderTimer: null, stream: null, receiver: null, receiveStarted: 0, receiveLoop: 0, diagnostics: {}, lastCameraFrame: 0, cameraFrames: 0, profile: "robust", verified: false };

const formatBytes = (value) => { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(2)} MB`; };
const formatRate = (value) => `${formatBytes(Math.max(0, value))}/s`;
const nativeBridge = () => globalThis.CamsendNative ?? null;
const bytesToBase64 = (bytes) => { let binary = ""; const chunk = 0x8000; for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk))); return btoa(binary); };
const setStatus = (id, text) => $(id).textContent = text;
const setVisible = (element, visible) => element.classList.toggle("hidden", !visible);

const renderMetrics = (id, values) => { const element = $(id); element.innerHTML = Object.entries(values).map(([label, value]) => `<div class="metric"><small>${label}</small><strong>${value}</strong></div>`).join(""); setVisible(element, true); };

const updateDiagnostics = (diagnostics = {}) => {
  state.diagnostics = { ...state.diagnostics, ...diagnostics };
  $("diag-markers").textContent = diagnostics.markerConfidence == null ? "—" : `${(diagnostics.markerConfidence * 100).toFixed(0)}%`;
  $("diag-calibration").textContent = diagnostics.calibrationSlope == null ? "—" : diagnostics.calibrationSlope.toFixed(3);
  $("diag-confidence").textContent = diagnostics.meanCellConfidence == null ? "—" : `${(diagnostics.meanCellConfidence * 100).toFixed(0)}%`;
  $("diag-rejection").textContent = state.receiver ? `${state.receiver.stats.rejectedPackets}` : "—";
  $("diag-rank").textContent = state.receiver?.decoder ? `${state.receiver.decoder.rank}/${state.receiver.decoder.sourceCount}` : "—";
};

const switchMode = (mode) => {
  state.mode = mode;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  $("send-panel").classList.toggle("active-panel", mode === "send");
  $("receive-panel").classList.toggle("active-panel", mode === "receive");
  $("send-panel").style.display = mode === "send" ? "block" : "none";
  $("receive-panel").style.display = mode === "receive" ? "block" : "none";
};

const stopSender = async () => {
  if (state.senderTimer) clearTimeout(state.senderTimer);
  state.senderTimer = null; state.sender = null;
  nativeBridge()?.setKeepScreenOn?.(false);
  setStatus("sender-state", "ready"); setVisible($("send-stage"), false);
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
};

const sendTick = () => {
  if (!state.sender) return;
  const profile = $("send-profile").value; const canvas = $("send-canvas");
  const frame = renderOpticalFrame(state.sender.packet(state.senderFrame++), profile, { width: PROFILES[profile].cols * 8 });
  canvas.width = frame.width; canvas.height = frame.height; canvas.getContext("2d", { alpha: false }).putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
  const elapsed = Math.max(0.001, (performance.now() - state.senderStarted) / 1000); const cadence = Number($("send-cadence").value);
  renderMetrics("send-metrics", { "frames shown": state.senderFrame.toLocaleString(), "estimated stream": formatRate(state.senderFrame * state.sender.blockSize / elapsed), "source blocks": state.sender.sourceCount.toLocaleString(), "profile": profile });
  state.senderTimer = setTimeout(sendTick, 1000 / cadence);
};

const startSender = async () => {
  const file = $("file-input").files[0]; if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer()); const profile = $("send-profile").value;
  state.sender = await new FileSender(bytes, file.name, { blockSize: PROFILES[profile].blockSize, flags: profile === "dense" ? 1 : 0 }).prepare();
  state.senderFrame = 0; state.senderStarted = performance.now(); setStatus("sender-state", "transmitting"); setVisible($("send-stage"), true); $("send-start").textContent = "Transmitting";
  nativeBridge()?.setKeepScreenOn?.(true); nativeBridge()?.setScreenBrightness?.(100);
  const canvas = $("send-canvas");
  if (document.fullscreenEnabled && canvas.requestFullscreen) await canvas.requestFullscreen().catch(() => {});
  sendTick();
};

const stopCamera = () => {
  if (state.receiveLoop) cancelAnimationFrame(state.receiveLoop); state.receiveLoop = 0;
  state.stream?.getTracks().forEach((track) => track.stop()); state.stream = null; $("camera-video").srcObject = null; $("camera-start").disabled = false; $("camera-stop").disabled = true; setStatus("receiver-state", "camera idle");
};

const cameraConstraints = () => ({ audio: false, video: { deviceId: $("camera-select").value ? { exact: $("camera-select").value } : undefined, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } } });

const populateCameras = async () => {
  const devices = await navigator.mediaDevices.enumerateDevices(); const select = $("camera-select"); const selected = select.value;
  select.innerHTML = `<option value="">Default camera</option>` + devices.filter((device) => device.kind === "videoinput").map((device, index) => `<option value="${device.deviceId}">${device.label || `Camera ${index + 1}`}</option>`).join("");
  if (selected) select.value = selected;
};

const receiveTick = () => {
  if (!state.stream) return;
  const video = $("camera-video"); const canvas = $("camera-canvas");
  if (video.readyState < 2 || !video.videoWidth) { state.receiveLoop = requestAnimationFrame(receiveTick); return; }
  if (video.currentTime === state.lastCameraFrame) { state.receiveLoop = requestAnimationFrame(receiveTick); return; }
  state.lastCameraFrame = video.currentTime; state.cameraFrames++;
  const scale = Math.min(1, 960 / video.videoWidth); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const profile = $("receive-profile").value; const decoded = decodeOpticalFrame(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, profile);
  if (decoded.ok) {
    state.diagnostics = { ...state.diagnostics, ...decoded.diagnostics }; const result = state.receiver.accept(decoded.encodedPacket); updateDiagnostics(decoded.diagnostics); setStatus("receiver-state", result.complete ? "verifying" : "receiving");
    const elapsed = Math.max(.001, (performance.now() - state.receiveStarted) / 1000); renderMetrics("receive-metrics", { progress: `${(state.receiver.progress * 100).toFixed(1)}%`, "camera frames": state.cameraFrames.toLocaleString(), "unique packets": state.receiver.seenSequences.size.toLocaleString(), "verified goodput": formatRate(result.complete ? (state.receiver.file?.length ?? 0) / elapsed : 0), rejected: state.receiver.stats.rejectedPackets.toLocaleString() });
    if (result.complete) finishReceive(elapsed);
  }
  state.receiveLoop = requestAnimationFrame(receiveTick);
};

const finishReceive = async (elapsed) => {
  if (state.verified) return;
  if (!state.receiver.file) return;
  const verified = await state.receiver.verify(); if (!verified.ok) { setStatus("receiver-state", "hash mismatch"); return; }
  state.verified = true;
  state.diagnostics.verifiedGoodput = state.receiver.file.length / Math.max(.001, elapsed); $("diag-goodput").textContent = formatRate(state.diagnostics.verifiedGoodput); setStatus("receiver-state", "verified");
  const blob = new Blob([state.receiver.file]); const url = URL.createObjectURL(blob); const download = $("download-file"); const fileName = state.receiver.meta.fileName || "received.bin"; download.href = url; download.download = fileName; download.onclick = () => { const bridge = nativeBridge(); if (bridge?.saveFile) { try { if (bridge.saveFile(fileName, bytesToBase64(state.receiver.file))) { setStatus("receiver-state", "saved locally"); return false; } } catch (error) { state.diagnostics.nativeSaveError = String(error); } } setTimeout(() => URL.revokeObjectURL(url), 1000); return true; }; setVisible(download, true);
};

const startCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) { setStatus("receiver-state", "camera API unavailable"); return; }
  stopCamera(); state.receiver = new FileReceiver(); state.receiveStarted = performance.now(); state.cameraFrames = 0; state.lastCameraFrame = 0; state.verified = false; nativeBridge()?.setKeepScreenOn?.(true); $("download-file").removeAttribute("href"); setVisible($("download-file"), false);
  try { state.stream = await navigator.mediaDevices.getUserMedia(cameraConstraints()); $("camera-video").srcObject = state.stream; await $("camera-video").play(); await populateCameras(); $("camera-start").disabled = true; $("camera-stop").disabled = false; setStatus("receiver-state", "looking for sender"); receiveTick(); } catch (error) { setStatus("receiver-state", `${error.name || "camera"} — permission needed`); }
};

$("file-input").addEventListener("change", () => { const file = $("file-input").files[0]; $("file-label").textContent = file?.name || "Choose a local file"; $("file-meta").textContent = file ? `${formatBytes(file.size)} · stays local` : "Nothing leaves this device."; $("send-start").disabled = !file; });
$("send-start").addEventListener("click", startSender); $("send-stop").addEventListener("click", stopSender); $("camera-start").addEventListener("click", startCamera); $("camera-stop").addEventListener("click", stopCamera); $("camera-select").addEventListener("change", startCamera);
$("send-profile").addEventListener("change", () => { if (state.sender) stopSender(); });
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchMode(tab.dataset.mode)));
$("export-diagnostics").addEventListener("click", () => { let nativeCapabilities = null; try { nativeCapabilities = JSON.parse(nativeBridge()?.capabilities?.() || "null"); } catch {} const payload = { schema: 1, exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, mode: state.mode, cameraFrames: state.cameraFrames, nativeCapabilities, diagnostics: state.diagnostics, receiverStats: state.receiver?.stats ?? null }; const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `camsend-diagnostics-${Date.now()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 500); });
window.addEventListener("beforeunload", stopCamera);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
switchMode("send");
