// src/app/api/cam-stream/route.js
// ═══════════════════════════════════════════════════════════════
//  Same-origin MJPEG proxy for the ESP32-CAM.
//
//  Why: reading pixels for the AI requires the camera frames to be
//  same-origin (otherwise the browser "taints" the canvas). Adding a
//  CORS header on the ESP firmware was unreliable, so instead the
//  Next.js server connects to the camera ONCE and re-serves the
//  stream from our own origin. The browser reads from here, so:
//    • no CORS / tainted-canvas issue (AI can read frames)
//    • the ESP32-CAM still has just ONE client (this server)
//    • works even if the app is served over HTTPS
//
//  Usage from the browser:  /api/cam-stream?ip=10.251.95.46
//  When the browser disconnects (Stop), request.signal aborts and the
//  upstream camera connection is torn down too.
// ═══════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ip = (searchParams.get("ip") || "").trim();

  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return new Response("Bad or missing ?ip=", { status: 400 });
  }

  const upstream = `http://${ip}:81/stream`;

  try {
    const res = await fetch(upstream, { signal: request.signal, cache: "no-store" });
    if (!res.ok || !res.body) {
      return new Response(`Camera responded ${res.status}`, { status: 502 });
    }
    // Pass the multipart content-type (incl. its boundary) through verbatim
    // so the browser parses the MJPEG frames.
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("content-type") || "multipart/x-mixed-replace",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (e) {
    if (e?.name === "AbortError") return new Response(null, { status: 499 });
    return new Response("Upstream fetch failed: " + (e?.message || e), { status: 502 });
  }
}