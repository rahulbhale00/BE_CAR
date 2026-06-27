// src/app/api/cam-stream/route.js
// ═══════════════════════════════════════════════════════════════
//  Single-upstream MJPEG HUB for the ESP32-CAM (fan-out proxy).
//
//  THE PROBLEM THIS SOLVES
//  -----------------------
//  The ESP32-CAM (OV2640) reliably serves only ONE /stream client.
//  The old proxy opened a NEW upstream fetch for every browser that
//  hit /api/cam-stream, so:
//    • laptop + phone at the same time = 2 upstream connections =
//      the camera chokes / drops one,
//    • Stop→Start (or a flaky reconnect) raced the old upstream
//      socket against the new one and often failed.
//
//  THE FIX
//  -------
//  This route keeps exactly ONE persistent upstream connection per
//  camera IP (a "hub") and FANS OUT its bytes to every browser that
//  asks. So:
//    • the ESP32-CAM always sees a single client (this server),
//    • laptop, phone, fullscreen tab… all watch the same hub,
//    • reconnect is robust: the hub's upstream lifecycle is managed
//      independently of any one browser connecting/disconnecting.
//
//  A new viewer joins mid-stream (gets a partial frame first); the
//  browser's MJPEG parser simply resyncs on the next boundary — this
//  is how every MJPEG fan-out works and is invisible in practice.
//
//  Usage from the browser:  /api/cam-stream?ip=10.251.95.46
// ═══════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

// Survive Next.js dev hot-reload (module re-eval) so we don't leak
// duplicate hubs on every save.
const HUBS = (globalThis.__CAM_HUBS ||= new Map()); // ip -> Hub

const IDLE_GRACE_MS = 10_000; // keep upstream alive this long after last viewer leaves

function makeHub(ip) {
  const hub = {
    ip,
    clients: new Set(),       // Set<ReadableStreamDefaultController>
    contentType: null,
    abort: null,              // AbortController for the upstream fetch
    connecting: null,         // Promise<void> while connecting
    idleTimer: null,
  };

  // Connect once; concurrent callers await the same promise.
  hub.connecting = (async () => {
    const ac = new AbortController();
    hub.abort = ac;
    const upstream = `http://${ip}:81/stream`;
    const res = await fetch(upstream, { signal: ac.signal, cache: "no-store" });
    if (!res.ok || !res.body) {
      throw new Error(`Camera responded ${res.status}`);
    }
    hub.contentType =
      res.headers.get("content-type") || "multipart/x-mixed-replace";

    // Pump upstream → all clients. Runs for the life of the hub.
    (async () => {
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const c of hub.clients) {
            try { c.enqueue(value); }
            catch { hub.clients.delete(c); }   // client already closed
          }
        }
      } catch {
        // upstream error / aborted — fall through to teardown
      } finally {
        tearDown(hub); // closes every client so browsers can reconnect
      }
    })();
  })();

  return hub;
}

function tearDown(hub) {
  if (HUBS.get(hub.ip) === hub) HUBS.delete(hub.ip);
  if (hub.idleTimer) { clearTimeout(hub.idleTimer); hub.idleTimer = null; }
  for (const c of hub.clients) {
    try { c.close(); } catch {}
  }
  hub.clients.clear();
  try { hub.abort?.abort(); } catch {}
}

async function getHub(ip) {
  let hub = HUBS.get(ip);
  if (!hub) {
    hub = makeHub(ip);
    HUBS.set(ip, hub);
  }
  if (hub.idleTimer) { clearTimeout(hub.idleTimer); hub.idleTimer = null; }
  try {
    await hub.connecting; // wait until upstream is connected (or fail)
  } catch (e) {
    tearDown(hub);
    throw e;
  }
  return hub;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ip = (searchParams.get("ip") || "").trim();

  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return new Response("Bad or missing ?ip=", { status: 400 });
  }

  let hub;
  try {
    hub = await getHub(ip);
  } catch (e) {
    if (e?.name === "AbortError") return new Response(null, { status: 499 });
    return new Response("Upstream fetch failed: " + (e?.message || e), { status: 502 });
  }

  // This browser's personal copy of the fanned-out stream.
  let myController = null;
  const leave = () => {
    if (!myController) return;
    hub.clients.delete(myController);
    myController = null;
    // Last viewer gone? Keep the camera warm briefly, then release it.
    if (hub.clients.size === 0 && !hub.idleTimer) {
      hub.idleTimer = setTimeout(() => {
        if (hub.clients.size === 0) tearDown(hub);
      }, IDLE_GRACE_MS);
    }
  };

  const body = new ReadableStream({
    start(controller) {
      myController = controller;
      hub.clients.add(controller);
    },
    cancel() { leave(); }, // browser disconnected / pressed Stop
  });

  // If the request is aborted (navigation, tab close), drop this client.
  request.signal?.addEventListener?.("abort", leave);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": hub.contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Connection": "keep-alive",
    },
  });
}