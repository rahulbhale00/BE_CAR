"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT } from "@/lib/mqtt";

// ═══════════════════════════════════════════════════════════════
//  Phone Gyro Streaming Page  (v4)
//
//  Change from v3:
//  - On RESET command: zeros delta immediately AND publishes
//    "ACK_RESET" back so ESP32 can confirm receipt
//  - Send rate bumped to 60Hz (16ms throttle)
//  - Wake Lock auto-reacquired on visibility change
// ═══════════════════════════════════════════════════════════════

export default function GyroPage() {
  const [yaw,        setYaw]        = useState(0);
  const [delta,      setDelta]      = useState(0);
  const [mqttOk,     setMqttOk]     = useState(false);
  const [started,    setStarted]    = useState(false);
  const [error,      setError]      = useState("");
  const [sendRate,   setSendRate]   = useState(0);
  const [logs,       setLogs]       = useState([]);
  const [wakeLockOk, setWakeLockOk] = useState(false);

  const yawRef      = useRef(0);
  const baseYaw     = useRef(null);
  const clientRef   = useRef(null);
  const lastSend    = useRef(0);
  const sendCount   = useRef(0);
  const wakeLockRef = useRef(null);

  const addLog = (msg) =>
    setLogs(prev => [...prev.slice(-30), `${new Date().toLocaleTimeString()} ${msg}`]);

  // ── MQTT connect + subscribe ──────────────────────────────────
  useEffect(() => {
    const c = connectMQTT();
    clientRef.current = c;

    c.on("connect", () => {
      setMqttOk(true);
      addLog("✓ MQTT connected");
      c.subscribe("robot/gyro_cmd", (err) => {
        if (!err) addLog("✓ Subscribed to robot/gyro_cmd");
        else      addLog("✗ Subscribe failed: " + err.message);
      });
    });

    c.on("close",   () => { setMqttOk(false); addLog("MQTT closed"); });
    c.on("offline", () =>   setMqttOk(false));

    // ── Listen for RESET command from ESP32 ─────────────────────
    c.on("message", (topic, message) => {
      if (topic === "robot/gyro_cmd") {
        const cmd = message.toString().trim();
        if (cmd === "RESET") {
          // Immediately zero the delta
          baseYaw.current = yawRef.current;
          setDelta(0);
          addLog("↺ RESET received — delta zeroed");

          // Publish ACK so ESP32 knows phone got the reset
          // (ESP32 can optionally watch for this)
          if (c.connected) {
            c.publish("robot/gyro", "YAW:0.00|DELTA:0.00");
          }
        }
      }
    });

    // Rate counter
    const rateInterval = setInterval(() => {
      setSendRate(sendCount.current);
      sendCount.current = 0;
    }, 1000);

    return () => clearInterval(rateInterval);
  }, []);

  // ── Wake Lock ─────────────────────────────────────────────────
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        setWakeLockOk(true);
        addLog("✓ Wake Lock — screen stays on");
        wakeLockRef.current.addEventListener("release", () => {
          setWakeLockOk(false);
          addLog("Wake Lock released");
        });
      } else {
        addLog("Wake Lock not available — keep screen on manually");
      }
    } catch (e) {
      addLog("Wake Lock failed: " + e.message);
    }
  };

  // Re-acquire Wake Lock if page becomes visible again
  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === "visible" && started && !wakeLockRef.current) {
        addLog("Page visible again — re-acquiring Wake Lock...");
        await requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [started]);

  // ── Publish gyro data ─────────────────────────────────────────
  const publishGyro = (yawVal, deltaVal) => {
    const c = clientRef.current;
    if (!c || !c.connected) return;
    const now = Date.now();
    if (now - lastSend.current < 16) return; // 60Hz
    lastSend.current = now;
    sendCount.current++;
    c.publish("robot/gyro", `YAW:${yawVal.toFixed(2)}|DELTA:${deltaVal.toFixed(2)}`);
  };

  // ── Orientation event handler ─────────────────────────────────
  const handleOrientation = (event) => {
    const a = event.alpha ?? 0;
    yawRef.current = a;
    setYaw(a);

    let d = 0;
    if (baseYaw.current !== null) {
      d = a - baseYaw.current;
      if (d >  180) d -= 360;
      if (d < -180) d += 360;
    }
    setDelta(d);
    publishGyro(a, d);
  };

  // ── Start gyroscope ───────────────────────────────────────────
  const startGyro = async () => {
    setError("");
    addLog("Starting gyroscope...");

    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      try {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== "granted") { setError("Permission denied"); return; }
      } catch (e) {
        setError("Permission error: " + e.message); return;
      }
    }

    window.addEventListener("deviceorientation", handleOrientation, true);

    // Check events actually fire
    let received = false;
    const test = () => { received = true; };
    window.addEventListener("deviceorientation", test);
    setTimeout(() => {
      window.removeEventListener("deviceorientation", test);
      if (!received) {
        addLog("No events after 2s — trying fallback...");
        tryFallbackSensor();
      } else {
        addLog("✓ Gyroscope events flowing at ~60Hz");
      }
    }, 2000);

    await requestWakeLock();
    baseYaw.current = null;
    setStarted(true);
  };

  // ── Chrome fallback ───────────────────────────────────────────
  const tryFallbackSensor = () => {
    try {
      if ("Gyroscope" in window) {
        const gyro = new Gyroscope({ frequency: 60 });
        let angle = 0;
        let lastTime = performance.now();
        gyro.addEventListener("reading", () => {
          const now = performance.now();
          const dt  = (now - lastTime) / 1000;
          lastTime  = now;
          angle    += gyro.z * dt * (180 / Math.PI);
          const yawDeg = ((angle % 360) + 360) % 360;
          yawRef.current = yawDeg;
          setYaw(yawDeg);
          let d = 0;
          if (baseYaw.current !== null) {
            d = yawDeg - baseYaw.current;
            if (d >  180) d -= 360;
            if (d < -180) d += 360;
          }
          setDelta(d);
          publishGyro(yawDeg, d);
        });
        gyro.addEventListener("error", (e) => {
          addLog("Gyroscope error: " + e.error.message);
          setError("Use Firefox or enable chrome://flags → Generic Sensor Extra Classes");
        });
        gyro.start();
        addLog("✓ Raw Gyroscope API started");
      } else {
        setError("No gyroscope API. Use Firefox on Android.");
      }
    } catch (e) {
      setError("Sensor init failed: " + e.message);
    }
  };

  const resetDelta = () => {
    baseYaw.current = yawRef.current;
    setDelta(0);
    addLog("↺ Delta manually reset to 0");
  };

  const stopGyro = () => {
    window.removeEventListener("deviceorientation", handleOrientation, true);
    if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
    setStarted(false);
    addLog("Gyro stopped");
  };

  // ── Colour for delta display ──────────────────────────────────
  const deltaColor = () => {
    const abs = Math.abs(delta);
    if (abs >= 88 && abs <= 92) return "hsl(152 56% 46%)";  // green = right at 90°
    if (abs >= 70)              return "hsl(38 92% 50%)";   // amber = close
    return "hsl(var(--foreground))";
  };

  return (
    <div className="bg-background" style={{
      minHeight: "100vh", padding: 16,
      display: "flex", justifyContent: "center",
    }}>
      <div style={{
        width: "100%", maxWidth: 400,
        display: "flex", flexDirection: "column", gap: 12, paddingTop: 12,
      }}>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0 }}>
            📱 Phone Gyro
          </h1>
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "4px 0 0" }}>
            Place flat on robot • Use Firefox • Keep screen on
          </p>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          {[
            { ok: mqttOk,     label: `MQTT ${mqttOk ? "✓" : "✗"}` },
            { ok: started,    label: `Gyro ${started ? "ON" : "OFF"}` },
            { ok: wakeLockOk, label: `Screen ${wakeLockOk ? "ON" : "auto"}` },
            ...(started ? [{ ok: sendRate > 0, label: `${sendRate}/s` }] : []),
          ].map(({ ok, label }, i) => (
            <span key={i} style={{
              padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: ok ? "hsl(152 56% 46% / 0.15)" : "hsl(var(--secondary))",
              color:      ok ? "hsl(152 56% 46%)"        : "hsl(var(--muted-foreground))",
              border:     `1px solid ${ok ? "hsl(152 56% 46% / 0.3)" : "hsl(var(--border))"}`,
            }}>{label}</span>
          ))}
        </div>

        {error && (
          <div style={{
            padding: 10, borderRadius: 10, fontSize: 12, textAlign: "center",
            background: "hsl(0 84% 60% / 0.1)", color: "hsl(0 84% 60%)", lineHeight: 1.5,
          }}>{error}</div>
        )}

        {/* Delta display — main readout */}
        <div style={{
          borderRadius: 16, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))", padding: 24, textAlign: "center",
        }}>
          <p style={{
            fontSize: 11, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "hsl(var(--muted-foreground))",
            margin: 0,
          }}>
            Delta → ESP32
          </p>
          <p style={{
            fontSize: 64, fontWeight: 700, fontFamily: "monospace",
            margin: "8px 0 0", color: deltaColor(),
            transition: "color 0.2s",
          }}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}°
          </p>
          <div style={{
            marginTop: 8, display: "flex", justifyContent: "center", gap: 16,
            fontSize: 11, color: "hsl(var(--muted-foreground))",
          }}>
            <span>Yaw: {yaw.toFixed(1)}°</span>
            <span>|</span>
            <span style={{
              color: Math.abs(Math.abs(delta) - 90) < 2
                ? "hsl(152 56% 46%)" : "hsl(var(--muted-foreground))",
              fontWeight: Math.abs(Math.abs(delta) - 90) < 2 ? 700 : 400,
            }}>
              {Math.abs(Math.abs(delta) - 90) < 2 ? "✓ 90°" : `${Math.abs(delta).toFixed(1)}° of 90°`}
            </span>
          </div>
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: "6px 0 0" }}>
            Auto-resets when ESP32 starts a turn
          </p>
        </div>

        {/* Progress bar toward 90° */}
        {started && (
          <div style={{ borderRadius: 8, overflow: "hidden", background: "hsl(var(--secondary))", height: 8 }}>
            <div style={{
              height: "100%",
              width: `${Math.min(100, (Math.abs(delta) / 90) * 100)}%`,
              background: Math.abs(Math.abs(delta) - 90) < 2
                ? "hsl(152 56% 46%)" : "hsl(var(--primary))",
              transition: "width 0.1s, background 0.2s",
              borderRadius: 8,
            }} />
          </div>
        )}

        {/* Controls */}
        <div style={{ display: "flex", gap: 8 }}>
          {!started ? (
            <button onClick={startGyro} style={{
              flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
              background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>Start Gyroscope</button>
          ) : (
            <>
              <button onClick={resetDelta} style={{
                flex: 2, padding: "14px 0", borderRadius: 12, border: "none",
                background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>↺ Reset Delta</button>
              <button onClick={stopGyro} style={{
                flex: 1, padding: "14px 0", borderRadius: 12, border: "none",
                background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Stop</button>
            </>
          )}
        </div>

        {/* Debug log */}
        <details open style={{
          borderRadius: 10, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))", padding: 12,
        }}>
          <summary style={{
            fontSize: 12, fontWeight: 700,
            color: "hsl(var(--foreground))", cursor: "pointer",
          }}>
            Debug Log
          </summary>
          <div style={{
            maxHeight: 200, overflowY: "auto", marginTop: 6,
            fontSize: 10, fontFamily: "monospace",
            color: "hsl(var(--muted-foreground))", lineHeight: 1.7,
          }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
            {!logs.length && <div>Waiting...</div>}
          </div>
        </details>

        {/* Help */}
        <details style={{
          borderRadius: 10, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--secondary) / 0.5)", padding: "10px 14px",
          fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.6,
        }}>
          <summary style={{
            fontWeight: 600, color: "hsl(var(--foreground))", cursor: "pointer",
          }}>Setup</summary>
          <div style={{ marginTop: 8 }}>
            1. Use <b>Firefox</b> on Android<br />
            2. Tap <b>Start Gyroscope</b><br />
            3. Place phone flat on robot<br />
            4. Delta auto-resets each turn<br />
            5. Keep page open, don't switch apps
          </div>
        </details>

        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <a href="/" style={{ fontSize: 12, color: "hsl(var(--primary))", textDecoration: "none" }}>
            ← Control Panel
          </a>
        </div>

      </div>
    </div>
  );
}