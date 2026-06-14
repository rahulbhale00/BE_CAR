"use client";

// ═══════════════════════════════════════════════════════════════
//  CameraFeed — ESP32-CAM (AI-Thinker) POV viewer
//
//  Streams the MJPEG feed from the ESP32-CAM's port-81 endpoint in a
//  plain <img> (the most efficient, lowest-latency way for an
//  OV2640 — the sensor hardware-compresses JPEG, the browser renders
//  multipart/x-mixed-replace natively, latency ≈ one frame).
//
//  Features
//   • Start/Stop  — stopping clears the <img> src, which frees the
//     ESP32's single stream slot (it only serves ONE viewer well).
//   • Open Settings — opens http://<ip>/ (port-80 web UI) in a tab.
//   • Quality presets — retune the live camera via the port-80
//     /control endpoint (framesize + jpeg quality) without leaving
//     the app. Sent as a fire-and-forget Image() GET so there are no
//     CORS issues.
//   • Editable IP — DHCP can hand the cam a new address; change it
//     here without touching code. (Backspace-safe input.)
//   • Auto-reconnect — on a stream error it retries with a fresh
//     connection every couple of seconds while "live" is on.
//   • Fullscreen — for a big POV view.
//   • AI object detection (Transformers.js + DETR, free/offline):
//     a transformer detector (DETR-ResNet-50) — much more accurate
//     than COCO-SSD. Reads frames from the SAME displayed feed (via
//     the same-origin proxy, so the canvas is never tainted), labels
//     objects below the feed, draws boxes over it. WebGPU-accelerated
//     when the browser supports it, WASM fallback otherwise.
//
//  Requires the proxy route at src/app/api/cam-stream/route.js.
//  Install once in your app:
//    npm i @huggingface/transformers
//  (You can remove the old @tensorflow/tfjs + coco-ssd packages.)
//  The model (~40-160 MB depending on dtype) downloads once on first
//  use and is cached by the browser; later loads are instant/offline.
//
//  Usage:
//    import CameraFeed from "@/components/CameraFeed";
//    <CameraFeed defaultIp="10.251.95.46" startStreaming />
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";

// ── Inline icons (match the app's stroke style) ────────────────
const IconBrain = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5a3 3 0 0 0-3-3 2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 4 7a2.5 2.5 0 0 0 1 4 2.5 2.5 0 0 0 2 4 2.5 2.5 0 0 0 5 .5V5z"/>
    <path d="M12 5a3 3 0 0 1 3-3 2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 20 7a2.5 2.5 0 0 1-1 4 2.5 2.5 0 0 1-2 4 2.5 2.5 0 0 1-5 .5V5z"/>
  </svg>
);

// ── Inline icons (match the app's stroke style) ────────────────
const IconCamera = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
  </svg>
);
const IconSettings = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);
const IconPlay = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const IconStop = ({ size = 15 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>;
const IconExpand = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
  </svg>
);
const IconEdit = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>
  </svg>
);

// ── Quality presets (framesize_t + jpeg quality) ───────────────
// framesize: 5=QVGA(320x240) 8=VGA(640x480) 9=SVGA(800x600)
// quality: 10 (sharp/large) … 20 (blocky/small). Smaller frame = lower latency.
const PRESETS = [
  { key: "smooth",   label: "Smooth",   sub: "QVGA · low latency",  framesize: 5, quality: 12 },
  { key: "balanced", label: "Balanced", sub: "VGA · 10–12 fps",     framesize: 8, quality: 12 },
  { key: "sharp",    label: "Sharp",    sub: "SVGA · more detail",  framesize: 9, quality: 10 },
];

const isValidIp = (s) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(s.trim());

export default function CameraFeed({
  defaultIp = "10.251.95.46", startStreaming = true, enableAI = true,
  streamPath = "/api/cam-stream", aiModel = "Xenova/detr-resnet-50", minScore = 0.6,
  rotation = 0,
}) {
  const [ip, setIp]             = useState(defaultIp);
  const [streaming, setStreaming] = useState(startStreaming);
  const [status, setStatus]     = useState(startStreaming ? "connecting" : "stopped"); // connecting|live|error|stopped
  const [nonce, setNonce]       = useState(0);          // bump to force a fresh connection
  const [preset, setPreset]     = useState("balanced");
  const [editingIp, setEditingIp] = useState(false);
  const [ipDraft, setIpDraft]   = useState(defaultIp);

  // AI object detection
  const [aiOn, setAiOn]         = useState(enableAI);
  const [modelStatus, setModelStatus] = useState("idle");   // idle|loading|ready|error
  const [modelProgress, setModelProgress] = useState(0);    // 0-100 during download
  const [detections, setDetections]   = useState([]);       // [{class, score, bbox:[x,y,w,h]}]
  const [dims, setDims]         = useState({ w: 4, h: 3 });  // natural frame size for the overlay
  const [aiError, setAiError]   = useState(null);

  const imgRef     = useRef(null);
  const wrapRef    = useRef(null);
  const retryRef   = useRef(null);
  const modelRef   = useRef(null);     // loaded detector pipeline (persists across toggles)
  const loopRef    = useRef(null);     // detection timer
  const histRef    = useRef([]);       // last few frames' class sets (stability filter)
  const capRef     = useRef(null);     // hidden canvas used to grab the current frame

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const isVert  = rotation === 90 || rotation === 270;

  const streamUrl = streaming ? `${streamPath}?ip=${encodeURIComponent(ip)}&_=${nonce}` : "";

  // Fire-and-forget GET to the port-80 /control endpoint (no CORS needed).
  const sendControl = (varName, val) => {
    if (!isValidIp(ip)) return;
    const img = new Image();
    img.src = `http://${ip}/control?var=${varName}&val=${val}&_=${Date.now()}`;
  };

  const applyPreset = (p) => {
    setPreset(p.key);
    // quality first, then framesize (framesize change re-inits the frame buffer)
    sendControl("quality", p.quality);
    setTimeout(() => sendControl("framesize", p.framesize), 120);
  };

  const start = () => { setStreaming(true); setStatus("connecting"); setNonce((n) => n + 1); };
  const stop  = () => {
    if (retryRef.current) { clearTimeout(retryRef.current); retryRef.current = null; }
    setStreaming(false); setStatus("stopped");
  };
  const toggle = () => (streaming ? stop() : start());

  const onImgLoad  = () => { if (streaming) setStatus("live"); };  // fires in Firefox; Chrome uses the poll below
  const onImgError = () => {
    if (!streaming) return;
    setStatus("error");
    if (retryRef.current) clearTimeout(retryRef.current);
    retryRef.current = setTimeout(() => { if (streaming) setNonce((n) => n + 1); }, 2000);
  };

  // MJPEG streams never fire <img> onLoad in Chromium (the connection stays
  // open), so the overlay would hang on "Connecting…" forever. Detect the
  // first decoded frame by polling naturalWidth instead.
  useEffect(() => {
    if (!streaming) return;
    let alive = true;
    const started = Date.now();
    const id = setInterval(() => {
      if (!alive) return;
      const img = imgRef.current;
      if (img && img.naturalWidth > 0) {
        setStatus("live");
        clearInterval(id);
      } else if (Date.now() - started > 8000) {
        setStatus("error");
        clearInterval(id);
        setNonce((n) => n + 1);   // no frame in 8s — force a reconnect
      }
    }, 300);
    return () => { alive = false; clearInterval(id); };
  }, [streaming, nonce]);

  useEffect(() => () => { if (retryRef.current) clearTimeout(retryRef.current); }, []);

  // ── AI: load COCO-SSD once, then detect on the displayed <img> ──
  // Lazy dynamic import so tfjs never runs during SSR and only loads
  // when AI is actually used. Reads frames from the SAME stream image,
  // so the ESP32-CAM still serves just one client.
  const ensureModel = async () => {
    if (modelRef.current) return modelRef.current;
    setModelStatus("loading");
    const { pipeline } = await import("@huggingface/transformers");
    const onProgress = (d) => {
      if (d?.status === "progress" && typeof d.progress === "number") setModelProgress(Math.round(d.progress));
    };
    // Prefer WebGPU (fast); fall back to WASM (works everywhere, slower).
    try {
      modelRef.current = await pipeline("object-detection", aiModel, { device: "webgpu", progress_callback: onProgress });
    } catch (e) {
      modelRef.current = await pipeline("object-detection", aiModel, { progress_callback: onProgress });
    }
    setModelStatus("ready");
    return modelRef.current;
  };

  useEffect(() => {
    const active = aiOn && streaming && status === "live";
    if (!active) {
      if (loopRef.current) { clearTimeout(loopRef.current); loopRef.current = null; }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureModel();
        if (cancelled) return;
        const tick = async () => {
          if (cancelled) return;
          const img = imgRef.current;
          if (img && img.naturalWidth > 0 && modelRef.current) {
            try {
              // Grab the current frame into a same-origin canvas (clean,
              // since the feed is proxied) and hand it to the detector.
              const cw = img.naturalWidth, ch = img.naturalHeight;
              let cv = capRef.current;
              if (!cv) { cv = document.createElement("canvas"); capRef.current = cv; }
              if (cv.width !== cw)  cv.width = cw;
              if (cv.height !== ch) cv.height = ch;
              const ctx = cv.getContext("2d");
              ctx.drawImage(img, 0, 0, cw, ch);
              const dataUrl = cv.toDataURL("image/jpeg", 0.85);

              const out = await modelRef.current(dataUrl, { threshold: minScore, percentage: false });
              if (cancelled) return;
              const preds = (out || []).map((o) => ({
                class: o.label,
                score: o.score,
                bbox: [o.box.xmin, o.box.ymin, o.box.xmax - o.box.xmin, o.box.ymax - o.box.ymin],
              }));
              // Stability filter: keep a class only if it showed up in at
              // least 2 of the last 3 frames (drops one-off misreads).
              const thisFrame = [...new Set(preds.map((p) => p.class))];
              histRef.current = [...histRef.current.slice(-2), thisFrame];
              const counts = {};
              histRef.current.flat().forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
              const stable = preds.filter((p) => counts[p.class] >= 2);
              setDims({ w: cw, h: ch });
              setDetections(stable);
              setAiError(null);
            } catch (err) {
              if (cancelled) return;
              setAiError("Couldn't analyze a frame. Make sure the proxy route /api/cam-stream exists and the feed is live.");
              setDetections([]);
              return;
            }
          }
          loopRef.current = setTimeout(tick, 250);       // small gap; pace is mostly the model
        };
        tick();
      } catch (e) {
        if (!cancelled) setModelStatus("error");
      }
    })();
    return () => { cancelled = true; if (loopRef.current) { clearTimeout(loopRef.current); loopRef.current = null; } };
  }, [aiOn, streaming, status]);

  const toggleAi = () => {
    setAiOn((v) => {
      const next = !v;
      if (!next) { setDetections([]); histRef.current = []; }
      return next;
    });
    setAiError(null);
  };

  const saveIp = () => {
    const v = ipDraft.trim();
    if (!isValidIp(v)) return;
    setIp(v); setEditingIp(false);
    if (streaming) { setStatus("connecting"); setNonce((n) => n + 1); }
  };

  const openSettings = () => {
    if (!isValidIp(ip)) return;
    window.open(`http://${ip}/`, "_blank", "noopener,noreferrer");
  };

  const goFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const dot = { live: "#22c55e", connecting: "#f59e0b", error: "#ef4444", stopped: "#94a3b8" }[status];
  const statusLabel = { live: "Live", connecting: "Connecting…", error: "Reconnecting…", stopped: "Stopped" }[status];

  return (
    <div style={{
      borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))",
      overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid hsl(var(--border))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ color: "hsl(var(--primary))", display: "flex" }}><IconCamera /></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.2 }}>Car POV</div>
            {!editingIp ? (
              <button onClick={() => { setIpDraft(ip); setEditingIp(true); }} style={{
                display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent",
                padding: 0, cursor: "pointer", color: "hsl(var(--muted-foreground))", fontSize: 11, fontFamily: "monospace",
              }}>
                {ip} <IconEdit />
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <input
                  type="text" inputMode="decimal" value={ipDraft} autoFocus
                  onChange={(e) => setIpDraft(e.target.value.replace(/[^0-9.]/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") saveIp(); if (e.key === "Escape") setEditingIp(false); }}
                  style={{
                    width: 120, padding: "3px 6px", borderRadius: 6, border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))", color: "hsl(var(--foreground))", fontSize: 11, fontFamily: "monospace",
                  }}
                />
                <button onClick={saveIp} disabled={!isValidIp(ipDraft)} style={{
                  border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", opacity: isValidIp(ipDraft) ? 1 : 0.4,
                }}>OK</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, borderRadius: 99, border: "1px solid hsl(var(--border))", padding: "4px 10px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, display: "inline-block" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--card-foreground))" }}>{statusLabel}</span>
        </div>
      </div>

      {/* Video area — 4:3 landscape or 3:4 portrait depending on rotation */}
      <div ref={wrapRef} style={{ position: "relative", width: "100%", aspectRatio: isVert ? "3 / 4" : "4 / 3", background: "#0b0b0f", overflow: "hidden" }}>
        {streaming ? (
          <div style={{
            position: "absolute", top: "50%", left: "50%",
            width:  isVert ? "133.33%" : "100%",
            height: isVert ? "75%"     : "100%",
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef} src={streamUrl} alt="ESP32-CAM stream"
              onLoad={onImgLoad} onError={onImgError}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />

            {/* Bounding-box overlay (inside the rotated wrapper so boxes align with the rotated feed) */}
            {aiOn && detections.length > 0 && (
              <svg viewBox={`0 0 ${dims.w} ${dims.h}`} preserveAspectRatio="xMidYMid meet"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                {detections.map((d, i) => {
                  const [x, y, w, h] = d.bbox;
                  const lbl = `${d.class} ${(d.score * 100).toFixed(0)}%`;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={w} height={h} fill="none" stroke="hsl(152 70% 45%)" strokeWidth={Math.max(2, dims.w / 200)} rx={4} />
                      <text x={x + 4} y={y > 14 ? y - 5 : y + 14} fill="hsl(152 70% 45%)"
                        fontSize={Math.max(11, dims.w / 32)} fontFamily="monospace" fontWeight="700"
                        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: Math.max(2, dims.w / 160) }}>
                        {lbl}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "hsl(var(--muted-foreground))" }}>
            <IconCamera size={32} />
            <span style={{ fontSize: 13 }}>Stream stopped</span>
          </div>
        )}

        {streaming && status !== "live" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.35)" }}>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
              {status === "error" ? "Reconnecting…" : "Connecting…"}
            </span>
          </div>
        )}

        {/* Fullscreen button overlay */}
        <button onClick={goFullscreen} title="Fullscreen" style={{
          position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 8, border: "none",
          background: "rgba(0,0,0,0.45)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <IconExpand />
        </button>
      </div>

      {/* Controls */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={toggle} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 0",
            borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: streaming ? "hsl(var(--destructive))" : "hsl(var(--primary))",
            color: streaming ? "hsl(var(--destructive-foreground))" : "hsl(var(--primary-foreground))",
          }}>
            {streaming ? <><IconStop /> Stop</> : <><IconPlay /> Start</>}
          </button>
          <button onClick={openSettings} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 14px",
            borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>
            <IconSettings /> Settings
          </button>
        </div>

        {/* Quality presets */}
        <div style={{ display: "flex", gap: 6 }}>
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p)} title={p.sub} style={{
              flex: 1, padding: "8px 4px", borderRadius: 10, cursor: "pointer", textAlign: "center",
              border: preset === p.key ? "1px solid hsl(var(--primary) / 0.6)" : "1px solid hsl(var(--border))",
              background: preset === p.key ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
            }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: preset === p.key ? "hsl(var(--primary))" : "hsl(var(--foreground))" }}>{p.label}</span>
              <span style={{ display: "block", fontSize: 10, color: "hsl(var(--muted-foreground))" }}>{p.sub}</span>
            </button>
          ))}
        </div>

        {/* AI object detection toggle + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, borderTop: "1px solid hsl(var(--border))", paddingTop: 10 }}>
          <button onClick={toggleAi} title="Toggle object detection" style={{
            position: "relative", width: 46, height: 26, borderRadius: 99, border: "none", flexShrink: 0,
            background: aiOn ? "hsl(var(--primary))" : "hsl(var(--secondary))", cursor: "pointer", transition: "background 0.2s",
          }}>
            <span style={{ position: "absolute", top: 3, left: aiOn ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.2s" }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>
              <IconBrain size={14} /> AI Object Detection {aiOn ? "On" : "Off"}
            </div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              {!aiOn ? "Names objects the camera sees"
                : modelStatus === "loading" ? `Loading model… ${modelProgress > 0 ? modelProgress + "%" : "(first-time download)"}`
                : modelStatus === "error" ? "Model failed to load"
                : "DETR · transformer detector"}
            </div>
          </div>
        </div>

        {/* Detected objects */}
        {aiOn && (
          <div>
            {aiError ? (
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "hsl(0 84% 55%)" }}>{aiError}</p>
            ) : detections.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                {modelStatus === "ready" ? "Nothing recognized yet…" : "Waiting for the model…"}
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {detections.map((d, i) => (
                  <span key={i} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 99,
                    fontSize: 12, fontWeight: 600, background: "hsl(152 56% 46% / 0.12)",
                    color: "hsl(152 56% 38%)", border: "1px solid hsl(152 56% 46% / 0.3)",
                  }}>
                    {d.class}
                    <span style={{ fontFamily: "monospace", opacity: 0.7, fontWeight: 500 }}>{(d.score * 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {isHttps && (
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "hsl(38 92% 40%)" }}>
            ⚠ On HTTPS the stream works (it's proxied same-origin), but the Settings link and quality presets talk to the camera directly over HTTP and may be blocked. Use HTTP for full control.
          </p>
        )}
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: "hsl(var(--muted-foreground))" }}>
          The ESP32-CAM serves one viewer at a time — Stop here before streaming in the Settings tab.
        </p>
      </div>
    </div>
  );
}