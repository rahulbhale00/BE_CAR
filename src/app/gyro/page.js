"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT } from "@/lib/mqtt";

export default function GyroPage() {
  const [yaw, setYaw]         = useState(0);
  const [pitch, setPitch]     = useState(0);
  const [roll, setRoll]       = useState(0);
  const [delta, setDelta]     = useState(0);
  const [mqttOk, setMqttOk]   = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError]     = useState("");
  const [sendRate, setSendRate] = useState(0);
  const [logs, setLogs]       = useState([]);

  const yawRef     = useRef(0);
  const baseYaw    = useRef(null);
  const clientRef  = useRef(null);
  const lastSend   = useRef(0);
  const sendCount  = useRef(0);
  const rateTimer  = useRef(null);

  const addLog = (msg) => {
    setLogs(prev => [...prev.slice(-15), `${new Date().toLocaleTimeString()} ${msg}`]);
  };

  useEffect(() => {
    const c = connectMQTT();
    clientRef.current = c;
    c.on("connect", () => { setMqttOk(true);  addLog("MQTT connected"); });
    c.on("close",   () => { setMqttOk(false); addLog("MQTT closed"); });
    c.on("offline", () => { setMqttOk(false); });

    rateTimer.current = setInterval(() => {
      setSendRate(sendCount.current);
      sendCount.current = 0;
    }, 1000);

    // Check what APIs are available
    addLog("Checking sensor APIs...");
    if (typeof DeviceOrientationEvent !== "undefined") {
      addLog("DeviceOrientationEvent: EXISTS");
      if (typeof DeviceOrientationEvent.requestPermission === "function") {
        addLog("requestPermission: EXISTS (iOS style)");
      } else {
        addLog("requestPermission: NOT needed (Android)");
      }
    } else {
      addLog("DeviceOrientationEvent: NOT FOUND");
    }

    if (typeof DeviceMotionEvent !== "undefined") {
      addLog("DeviceMotionEvent: EXISTS");
    }

    if (window.isSecureContext) {
      addLog("Secure context: YES (HTTPS or localhost)");
    } else {
      addLog("Secure context: NO (HTTP) — sensors may be blocked!");
      addLog("Fix: chrome://flags → enable sensor flags");
    }

    return () => { if (rateTimer.current) clearInterval(rateTimer.current); };
  }, []);

  const publishGyro = (yawVal, deltaVal) => {
    const c = clientRef.current;
    if (!c || !c.connected) return;
    const now = Date.now();
    if (now - lastSend.current < 50) return;
    lastSend.current = now;
    sendCount.current++;
    c.publish("robot/gyro", `YAW:${yawVal.toFixed(2)}|DELTA:${deltaVal.toFixed(2)}`);
  };

  const handleOrientation = (event) => {
    const a = event.alpha ?? 0;
    const b = event.beta  ?? 0;
    const g = event.gamma ?? 0;

    yawRef.current = a;
    setYaw(a);
    setPitch(b);
    setRoll(g);

    let d = 0;
    if (baseYaw.current !== null) {
      d = a - baseYaw.current;
      if (d > 180)  d -= 360;
      if (d < -180) d += 360;
    }
    setDelta(d);
    publishGyro(a, d);
  };

  const startGyro = async () => {
    setError("");
    addLog("Starting gyroscope...");

    // Method 1: iOS permission request
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        addLog("Requesting iOS permission...");
        const perm = await DeviceOrientationEvent.requestPermission();
        addLog("Permission result: " + perm);
        if (perm !== "granted") {
          setError("Permission denied");
          return;
        }
      } catch (e) {
        addLog("Permission error: " + e.message);
        setError("Permission error: " + e.message);
        return;
      }
    }

    // Method 2: Standard listener
    addLog("Adding deviceorientation listener...");
    window.addEventListener("deviceorientation", handleOrientation, true);

    // Test if any events fire within 2 seconds
    let receivedEvent = false;
    const testHandler = () => { receivedEvent = true; };
    window.addEventListener("deviceorientation", testHandler);

    setTimeout(() => {
      window.removeEventListener("deviceorientation", testHandler);
      if (!receivedEvent) {
        addLog("NO events received after 2s!");
        addLog("Trying AbsoluteOrientationSensor...");
        tryAbsoluteSensor();
      } else {
        addLog("Events are flowing!");
        setStarted(true);
      }
    }, 2000);

    setStarted(true);
  };

  // Fallback: AbsoluteOrientationSensor API (newer Chrome)
  const tryAbsoluteSensor = () => {
    try {
      if ("AbsoluteOrientationSensor" in window) {
        addLog("AbsoluteOrientationSensor found, trying...");
        const sensor = new AbsoluteOrientationSensor({ frequency: 20 });
        sensor.addEventListener("reading", () => {
          const q = sensor.quaternion;
          // Convert quaternion to euler angles
          const [qx, qy, qz, qw] = q;
          const yawRad = Math.atan2(2*(qw*qz + qx*qy), 1 - 2*(qy*qy + qz*qz));
          const yawDeg = (yawRad * 180 / Math.PI + 360) % 360;
          yawRef.current = yawDeg;
          setYaw(yawDeg);

          let d = 0;
          if (baseYaw.current !== null) {
            d = yawDeg - baseYaw.current;
            if (d > 180) d -= 360;
            if (d < -180) d += 360;
          }
          setDelta(d);
          publishGyro(yawDeg, d);
        });
        sensor.addEventListener("error", (e) => {
          addLog("Sensor error: " + e.error.message);
          setError("Sensor blocked. Enable chrome://flags → Generic Sensor Extra Classes");
        });
        sensor.start();
        addLog("AbsoluteOrientationSensor started!");
      } else if ("Gyroscope" in window) {
        addLog("Trying raw Gyroscope API...");
        const gyro = new Gyroscope({ frequency: 20 });
        let angle = 0;
        let lastTime = performance.now();
        gyro.addEventListener("reading", () => {
          const now = performance.now();
          const dt = (now - lastTime) / 1000;
          lastTime = now;
          angle += gyro.z * dt * (180 / Math.PI);
          setYaw(((angle % 360) + 360) % 360);
          setDelta(angle);
          publishGyro(((angle % 360) + 360) % 360, angle);
        });
        gyro.addEventListener("error", (e) => {
          addLog("Gyroscope error: " + e.error.message);
          setError("Gyroscope blocked. Enable chrome://flags → Generic Sensor Extra Classes");
        });
        gyro.start();
        addLog("Raw Gyroscope started!");
      } else {
        addLog("No sensor APIs available!");
        setError("No gyroscope API available on this browser.");
      }
    } catch (e) {
      addLog("Sensor init failed: " + e.message);
      setError("Sensor init failed: " + e.message);
    }
  };

  const resetDelta = () => {
    baseYaw.current = yawRef.current;
    setDelta(0);
    if (clientRef.current?.connected) {
      clientRef.current.publish("robot/gyro", "RESET");
    }
    addLog("Delta reset to 0");
  };

  const stopGyro = () => {
    window.removeEventListener("deviceorientation", handleOrientation, true);
    setStarted(false);
    addLog("Gyro stopped");
  };

  const compassStyle = {
    width: 180, height: 180, borderRadius: "50%",
    border: "3px solid hsl(var(--border))",
    background: "hsl(var(--card))",
    position: "relative", margin: "0 auto",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  };

  const needleStyle = {
    position: "absolute", top: "10%", left: "calc(50% - 2px)",
    width: 4, height: "40%", borderRadius: 2,
    background: "hsl(var(--primary))",
    transformOrigin: "bottom center",
    transform: `rotate(${yaw}deg)`,
    transition: "transform 0.05s linear",
  };

  return (
    <div className="bg-background" style={{
      minHeight: "100vh", padding: 16,
      display: "flex", justifyContent: "center",
    }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 12, paddingTop: 12 }}>

        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "hsl(var(--foreground))", margin: 0 }}>
            Phone Gyroscope
          </h1>
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "4px 0 0" }}>
            Phone → MQTT → ESP32 Serial Monitor
          </p>
        </div>

        {/* Status */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
          {[
            { ok: mqttOk, label: `MQTT: ${mqttOk ? "OK" : "Off"}` },
            { ok: started, label: `Gyro: ${started ? "ON" : "Off"}` },
            ...(started ? [{ ok: true, label: `${sendRate}/s` }] : []),
          ].map(({ ok, label }, i) => (
            <span key={i} style={{
              padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600,
              background: ok ? "hsl(152 56% 46% / 0.15)" : "hsl(var(--secondary))",
              color: ok ? "hsl(152 56% 46%)" : "hsl(var(--muted-foreground))",
              border: "1px solid",
              borderColor: ok ? "hsl(152 56% 46% / 0.3)" : "hsl(var(--border))",
            }}>{label}</span>
          ))}
        </div>

        {error && (
          <div style={{
            padding: 10, borderRadius: 10,
            background: "hsl(0 84% 60% / 0.1)", color: "hsl(0 84% 60%)",
            fontSize: 12, textAlign: "center", lineHeight: 1.5,
          }}>{error}</div>
        )}

        {/* Compass */}
        <div style={compassStyle}>
          <div style={needleStyle} />
          <div style={{
            position: "absolute", bottom: "8%", width: "100%",
            textAlign: "center", fontSize: 24, fontWeight: 700,
            fontFamily: "monospace", color: "hsl(var(--foreground))",
          }}>{yaw.toFixed(1)}°</div>
        </div>

        {/* Delta */}
        <div style={{
          borderRadius: 14, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))", padding: 16, textAlign: "center",
        }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", margin: "0 0 4px",
            textTransform: "uppercase", letterSpacing: "0.08em" }}>Delta (since reset)</p>
          <p style={{
            fontSize: 44, fontWeight: 700, fontFamily: "monospace", margin: 0,
            color: Math.abs(delta) > 85 && Math.abs(delta) < 95
              ? "hsl(152 56% 46%)" : "hsl(var(--foreground))",
          }}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(1)}°
          </p>
        </div>

        {/* Raw */}
        <div style={{
          borderRadius: 10, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))", padding: 12,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
        }}>
          {[
            { l: "Yaw", v: yaw }, { l: "Pitch", v: pitch }, { l: "Roll", v: roll },
          ].map(({ l, v }) => (
            <div key={l} style={{ textAlign: "center" }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: "hsl(var(--muted-foreground))", margin: 0 }}>{l}</p>
              <p style={{ fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: "hsl(var(--foreground))", margin: "2px 0 0" }}>
                {v.toFixed(1)}°
              </p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8 }}>
          {!started ? (
            <button onClick={startGyro} style={{
              flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
              background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
              fontSize: 15, fontWeight: 700, cursor: "pointer",
            }}>
              Start Gyroscope
            </button>
          ) : (
            <>
              <button onClick={resetDelta} style={{
                flex: 2, padding: "13px 0", borderRadius: 12, border: "none",
                background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
                fontSize: 14, fontWeight: 700, cursor: "pointer",
              }}>Reset Delta to 0</button>
              <button onClick={stopGyro} style={{
                flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Stop</button>
            </>
          )}
        </div>

        {/* Debug log */}
        <div style={{
          borderRadius: 10, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))", padding: 12,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "hsl(var(--foreground))", margin: "0 0 6px" }}>
            Debug Log
          </p>
          <div style={{
            maxHeight: 200, overflowY: "auto",
            fontSize: 10, fontFamily: "monospace",
            color: "hsl(var(--muted-foreground))", lineHeight: 1.6,
          }}>
            {logs.map((l, i) => <div key={i}>{l}</div>)}
            {logs.length === 0 && <div>Waiting...</div>}
          </div>
        </div>

        {/* Setup help */}
        <details style={{
          borderRadius: 10, border: "1px solid hsl(var(--border))",
          background: "hsl(var(--secondary) / 0.5)", padding: "10px 14px",
          fontSize: 12, color: "hsl(var(--muted-foreground))", lineHeight: 1.6,
        }}>
          <summary style={{ fontWeight: 600, color: "hsl(var(--foreground))", cursor: "pointer" }}>
            Gyro not working? Tap here
          </summary>
          <div style={{ marginTop: 8 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>Chrome Android fix:</p>
            <p style={{ margin: 0 }}>
              1. Open <code>chrome://flags</code> in phone Chrome<br/>
              2. Search <b>"Generic Sensor Extra Classes"</b> → Enable<br/>
              3. Search <b>"Sensors Without Isolation"</b> → Enable<br/>
              4. Tap Relaunch at bottom<br/>
              5. Come back to this page and tap Start
            </p>
            <p style={{ margin: "12px 0 0", fontWeight: 600 }}>Still not working?</p>
            <p style={{ margin: 0 }}>
              Try Firefox on Android — it allows sensors over HTTP without flags.
            </p>
          </div>
        </details>

        <div style={{ textAlign: "center", padding: "4px 0" }}>
          <a href="/" style={{ fontSize: 12, color: "hsl(var(--primary))", textDecoration: "none" }}>
            ← Back to Control Panel
          </a>
        </div>
      </div>
    </div>
  );
}