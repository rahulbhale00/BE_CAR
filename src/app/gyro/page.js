"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT } from "@/lib/mqtt";

// ═══════════════════════════════════════════════════════════════
//  Phone Gyro + Audio Streaming Page  (v5)
//
//  v5 adds OBSTACLE AUDIO:
//   - Subscribes to "robot/audio_cmd"
//   - "HORN" → klaxon + spoken "Obstacle detected"
//   - "MOVE" → chime + spoken "Please move aside, obstacle ahead"
//   Audio is synthesized with the Web Audio API + SpeechSynthesis
//   (no sound files needed). The AudioContext is unlocked on the
//   "Start Gyroscope" tap because mobile browsers block autoplay.
//
//  v4 behaviour (gyro streaming, RESET, Wake Lock) is unchanged.
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
  const [audioReady, setAudioReady] = useState(false);
  const [playing,    setPlaying]    = useState(null);   // "HORN" | "MOVE" | null

  const yawRef      = useRef(0);
  const baseYaw     = useRef(null);
  const clientRef   = useRef(null);
  const lastSend    = useRef(0);
  const sendCount   = useRef(0);
  const wakeLockRef = useRef(null);
  const audioCtxRef = useRef(null);
  const playHornRef = useRef(() => {});
  const playMoveRef = useRef(() => {});

  const addLog = (msg) =>
    setLogs(prev => [...prev.slice(-30), `${new Date().toLocaleTimeString()} ${msg}`]);

  // ── Audio engine ──────────────────────────────────────────────
  const ensureAudio = async () => {
    try {
      if (!audioCtxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { addLog("Web Audio not supported"); return false; }
        audioCtxRef.current = new AC();
      }
      if (audioCtxRef.current.state === "suspended") await audioCtxRef.current.resume();
      setAudioReady(true);
      return true;
    } catch (e) {
      addLog("Audio init failed: " + e.message);
      return false;
    }
  };

  // Schedule a single tone on the shared context.
  const beep = (freq, startSec, durSec, type = "square", vol = 0.9) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + startSec;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.setValueAtTime(vol, t0 + durSec - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.03);
  };

  const speak = (text) => {
    try {
      if (!("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1; u.pitch = 1; u.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  };

  // HORN — loud alternating klaxon + voice
  const playHorn = async () => {
    if (!(await ensureAudio())) return;
    setPlaying("HORN");
    let t = 0;
    for (let i = 0; i < 3; i++) {
      beep(540, t, 0.18, "sawtooth", 0.95); t += 0.2;
      beep(400, t, 0.18, "sawtooth", 0.95); t += 0.2;
    }
    speak("Obstacle detected");
    setTimeout(() => setPlaying(null), (t + 0.4) * 1000);
  };

  // MOVE — polite chime + spoken request
  const playMoveAside = async () => {
    if (!(await ensureAudio())) return;
    setPlaying("MOVE");
    beep(700, 0, 0.14, "sine", 0.7);
    beep(950, 0.16, 0.16, "sine", 0.7);
    speak("Please move aside. Obstacle ahead.");
    setTimeout(() => setPlaying(null), 3200);
  };

  // keep latest fns reachable from the (once-only) MQTT handler
  playHornRef.current = playHorn;
  playMoveRef.current = playMoveAside;

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
      c.subscribe("robot/audio_cmd", (err) => {
        if (!err) addLog("✓ Subscribed to robot/audio_cmd");
        else      addLog("✗ Audio subscribe failed: " + err.message);
      });
    });

    c.on("close",   () => { setMqttOk(false); addLog("MQTT closed"); });
    c.on("offline", () =>   setMqttOk(false));

    c.on("message", (topic, message) => {
      // ── RESET from ESP32 ────────────────────────────────────
      if (topic === "robot/gyro_cmd") {
        const cmd = message.toString().trim();
        if (cmd === "RESET") {
          baseYaw.current = yawRef.current;
          setDelta(0);
          addLog("↺ RESET received — delta zeroed");
          if (c.connected) c.publish("robot/gyro", "YAW:0.00|DELTA:0.00");
        }
        return;
      }

      // ── Audio commands from app ─────────────────────────────
      if (topic === "robot/audio_cmd") {
        const cmd = message.toString().trim();
        addLog("🔊 audio cmd: " + cmd);
        if (cmd === "HORN")      playHornRef.current();
        else if (cmd === "MOVE") playMoveRef.current();
        return;
      }
    });

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

  // ── Orientation handler ───────────────────────────────────────
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

  // ── Start gyroscope (also unlocks audio — user gesture) ───────
  const startGyro = async () => {
    setError("");
    addLog("Starting gyroscope...");

    // Unlock audio on this tap (required by mobile browsers)
    await ensureAudio();
    speak(" ");  // prime speech engine

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

    let received = false;
    const test = () => { received = true; };
    window.addEventListener("deviceorientation", test);
    setTimeout(() => {
      window.removeEventListener("deviceorientation", test);
      if (!received) { addLog("No events after 2s — trying fallback..."); tryFallbackSensor(); }
      else           { addLog("✓ Gyroscope events flowing at ~60Hz"); }
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

  const deltaColor = () => {
    const abs = Math.abs(delta);
    if (abs >= 88 && abs <= 92) return "hsl(152 56% 46%)";
    if (abs >= 70)              return "hsl(38 92% 50%)";
    return "hsl(var(--foreground))";
  };

  return (
    <div className="bg-background" style={{ minHeight: "100vh", padding: 16, display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>

        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0 }}>📱 Phone Gyro + Horn</h1>
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "4px 0 0" }}>
            Place flat on robot • Use Firefox • Keep screen on
          </p>
        </div>

        {/* Status badges */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          {[
            { ok: mqttOk,     label: `MQTT ${mqttOk ? "✓" : "✗"}` },
            { ok: started,    label: `Gyro ${started ? "ON" : "OFF"}` },
            { ok: audioReady, label: `Audio ${audioReady ? "✓" : "✗"}` },
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
          <div style={{ padding: 10, borderRadius: 10, fontSize: 12, textAlign: "center", background: "hsl(0 84% 60% / 0.1)", color: "hsl(0 84% 60%)", lineHeight: 1.5 }}>{error}</div>
        )}

        {/* Playing banner */}
        {playing && (
          <div style={{
            padding: "10px 14px", borderRadius: 12, textAlign: "center", fontSize: 14, fontWeight: 700,
            background: playing === "HORN" ? "hsl(0 84% 60% / 0.12)" : "hsl(38 92% 50% / 0.14)",
            color:      playing === "HORN" ? "hsl(0 84% 60%)"        : "hsl(38 92% 40%)",
            border:     `1px solid ${playing === "HORN" ? "hsl(0 84% 60% / 0.3)" : "hsl(38 92% 50% / 0.3)"}`,
            animation: "pulse-audio 0.8s ease-in-out infinite",
          }}>
            {playing === "HORN" ? "📢 HORN — Obstacle detected!" : "🗣️ Please move aside…"}
          </div>
        )}

        {/* Delta display */}
        <div style={{ borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(var(--muted-foreground))", margin: 0 }}>Delta → ESP32</p>
          <p style={{ fontSize: 64, fontWeight: 700, fontFamily: "monospace", margin: "8px 0 0", color: deltaColor(), transition: "color 0.2s" }}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}°
          </p>
          <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 16, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
            <span>Yaw: {yaw.toFixed(1)}°</span>
            <span>|</span>
            <span style={{
              color: Math.abs(Math.abs(delta) - 90) < 2 ? "hsl(152 56% 46%)" : "hsl(var(--muted-foreground))",
              fontWeight: Math.abs(Math.abs(delta) - 90) < 2 ? 700 : 400,
            }}>
              {Math.abs(Math.abs(delta) - 90) < 2 ? "✓ 90°" : `${Math.abs(delta).toFixed(1)}° of 90°`}
            </span>
          </div>
          <p style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", margin: "6px 0 0" }}>Auto-resets when ESP32 starts a turn</p>
        </div>

        {/* Progress bar */}
        {started && (
          <div style={{ borderRadius: 8, overflow: "hidden", background: "hsl(var(--secondary))", height: 8 }}>
            <div style={{
              height: "100%", width: `${Math.min(100, (Math.abs(delta) / 90) * 100)}%`,
              background: Math.abs(Math.abs(delta) - 90) < 2 ? "hsl(152 56% 46%)" : "hsl(var(--primary))",
              transition: "width 0.1s, background 0.2s", borderRadius: 8,
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
            }}>Start Gyroscope &amp; Audio</button>
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

        {/* Audio test row */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => playHornRef.current()} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid hsl(0 84% 60% / 0.3)",
            background: "hsl(0 84% 60% / 0.08)", color: "hsl(0 84% 55%)", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>📢 Test Horn</button>
          <button onClick={() => playMoveRef.current()} style={{
            flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid hsl(38 92% 50% / 0.35)",
            background: "hsl(38 92% 50% / 0.1)", color: "hsl(38 92% 38%)", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>🗣️ Test Voice</button>
        </div>
        {!audioReady && (
          <p style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textAlign: "center", margin: 0 }}>
            Tap “Start Gyroscope &amp; Audio” (or a test button) once to unlock sound.
          </p>
        )}

        {/* Debug log */}
        <details open style={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 12 }}>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))", cursor: "pointer" }}>Debug Log</summary>
          <div style={{ maxHeight: 200, overflowY: "auto", marginTop: 6, fontSize: 10, fontFamily: "monospace", color: "hsl(var(--muted-foreground))", lineHeight: 1.7 }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
            {!logs.length && <div>Waiting...</div>}
          </div>
        </details>

        {/* Help */}
        <details style={{ borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--secondary) / 0.5)", padding: "10px 14px", fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
          <summary style={{ fontWeight: 600, color: "hsl(var(--foreground))", cursor: "pointer" }}>Setup</summary>
          <div style={{ marginTop: 8 }}>
            1. Use <b>Firefox</b> on Android<br />
            2. Tap <b>Start Gyroscope &amp; Audio</b> (unlocks sound)<br />
            3. Place phone flat on robot<br />
            4. Turn the volume up — horn plays here on obstacle<br />
            5. Keep page open, don&apos;t switch apps
          </div>
        </details>

        <div style={{ textAlign: "center", paddingBottom: 8 }}>
          <a href="/" style={{ fontSize: 12, color: "hsl(var(--primary))", textDecoration: "none" }}>← Control Panel</a>
        </div>

      </div>

      <style>{`@keyframes pulse-audio { 0%,100%{opacity:1} 50%{opacity:0.55} }`}</style>
    </div>
  );
}