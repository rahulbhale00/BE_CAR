"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT, sendCommand } from "@/lib/mqtt";

// ── Calibration ──────────────────────────────────────────────────────────────
const STEP_MS_FWD  = 500;
const STEP_MS_TURN = 400;
const GAP_MS       = 500;

// ── Inline SVG icons (no lucide needed) ─────────────────────────────────────
const IconBot = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/>
    <path d="M12 7v4M8 15h.01M16 15h.01"/>
  </svg>
);
const IconGamepad = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/>
    <circle cx="17" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/>
    <rect x="2" y="8" width="20" height="8" rx="3"/>
  </svg>
);
const IconCircle = ({ fill = false }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
  </svg>
);
const IconZap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconArrowUp    = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const IconArrowDown  = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
const IconArrowLeft  = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>;
const IconArrowRight = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconSquare = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>;
const IconUndo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 00-4-4H4"/>
  </svg>
);
const IconCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IconPlay = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const IconStop2 = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none"/></svg>;
const IconNav = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>;
const IconGauge = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 12L8 8"/><circle cx="12" cy="12" r="1" fill="currentColor"/>
  </svg>
);
const IconKeyboard = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"/>
  </svg>
);
const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconRotateCcw = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/>
  </svg>
);
const IconSpinner = () => (
  <span style={{ display:"inline-block", width:18, height:18, border:"2.5px solid currentColor", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.6s linear infinite" }} />
);

// ── Helpers ──────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const cn = (...classes) => classes.filter(Boolean).join(" ");

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status, label }) {
  const dotClass = {
    online:  "bg-signal-online",
    offline: "bg-signal-offline",
    moving:  "bg-signal-moving animate-pulse-dot",
    idle:    "bg-muted-foreground",
  }[status] || "bg-muted-foreground";

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8,
      borderRadius:99, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:"6px 12px",
      boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <span className={dotClass} style={{ width:8, height:8, borderRadius:"50%", display:"inline-block" }} />
      <span style={{ fontSize:12, fontWeight:500, color:"hsl(var(--card-foreground))" }}>{label}</span>
    </div>
  );
}

function DPadButton({ onClick, disabled, active, isStop, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center transition-all duration-150 active:scale-95",
        isStop
          ? "h-12 w-12 rounded-2xl border bg-destructive/10 text-destructive hover:bg-destructive/20 disabled:opacity-40 border-destructive/30"
          : cn(
              "h-16 w-16 rounded-2xl border bg-card text-card-foreground shadow-sm hover:shadow-md hover:border-primary/30 disabled:opacity-30",
              active && "border-primary/50 shadow-md animate-ripple"
            )
      )}
      style={{ borderColor: active && !isStop ? "hsl(var(--primary) / 0.5)" : undefined }}
    >
      {active && !isStop ? <IconSpinner /> : children}
    </button>
  );
}

function DirectionPad({ onDirection, onStop, busy, isRunning, activeCmd }) {
  const disabled = busy || isRunning;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
      <DPadButton onClick={() => onDirection("F")} disabled={disabled} active={busy && activeCmd==="F"}>
        <IconArrowUp />
      </DPadButton>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <DPadButton onClick={() => onDirection("L")} disabled={disabled} active={busy && activeCmd==="L"}>
          <IconArrowLeft />
        </DPadButton>
        <DPadButton onClick={onStop} disabled={false} active={false} isStop>
          <IconSquare />
        </DPadButton>
        <DPadButton onClick={() => onDirection("R")} disabled={disabled} active={busy && activeCmd==="R"}>
          <IconArrowRight />
        </DPadButton>
      </div>
      <DPadButton onClick={() => onDirection("B")} disabled={disabled} active={busy && activeCmd==="B"}>
        <IconArrowDown />
      </DPadButton>
    </div>
  );
}

function ModeSelector({ mode, onChange, disabled }) {
  const modes = [
    { id:"control", label:"Control", icon:<IconGamepad /> },
    { id:"record",  label:"Record",  icon:<IconCircle /> },
    { id:"auto",    label:"Auto",    icon:<IconZap /> },
  ];
  return (
    <div style={{
      display:"flex", gap:4, borderRadius:12,
      background:"hsl(var(--secondary) / 0.6)", padding:4,
    }}>
      {modes.map((m) => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          disabled={disabled}
          style={{
            flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            borderRadius:8, padding:"8px 12px",
            fontSize:14, fontWeight:500,
            border:"none",
            background: mode===m.id ? "hsl(var(--card))" : "transparent",
            color: mode===m.id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
            boxShadow: mode===m.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.4 : 1,
            transition:"all 0.2s",
          }}
        >
          {m.icon}
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function SpeedControl({ speed, onChange }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12,
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:"10px 16px",
    }}>
      <IconGauge />
      <span style={{ fontSize:13, fontWeight:500, color:"hsl(var(--muted-foreground))", flexShrink:0 }}>Speed</span>
      <input
        type="range" min={60} max={255} value={speed}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{ flex:1 }}
      />
      <span className="font-mono-code" style={{ fontSize:13, fontWeight:600, color:"hsl(var(--foreground))", width:28, textAlign:"right" }}>
        {speed}
      </span>
    </div>
  );
}

function PathPreview({ steps }) {
  if (!steps.length) return null;
  const cmdIcon = { F:<IconArrowUp size={12}/>, B:<IconArrowDown size={12}/>, L:<IconArrowLeft size={12}/>, R:<IconArrowRight size={12}/> };
  const cmdColor = {
    F:"background:hsl(var(--accent)/0.15);color:hsl(var(--accent));border-color:hsl(var(--accent)/0.2)",
    B:"background:hsl(var(--accent)/0.15);color:hsl(var(--accent));border-color:hsl(var(--accent)/0.2)",
    L:"background:hsl(var(--primary)/0.1);color:hsl(var(--primary));border-color:hsl(var(--primary)/0.2)",
    R:"background:hsl(var(--primary)/0.1);color:hsl(var(--primary));border-color:hsl(var(--primary)/0.2)",
  };
  return (
    <div className="animate-slide-up" style={{
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:16,
      animationDelay:"0.1s",
    }}>
      <p style={{ fontSize:11, fontWeight:600, color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>
        Recorded Path
      </p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {steps.map((step, i) => {
          const style = {};
          if (step.cmd==="F"||step.cmd==="B") {
            style.background = "hsl(152 56% 46% / 0.15)";
            style.color = "hsl(var(--accent))";
            style.borderColor = "hsl(152 56% 46% / 0.2)";
          } else {
            style.background = "hsl(var(--primary) / 0.1)";
            style.color = "hsl(var(--primary))";
            style.borderColor = "hsl(var(--primary) / 0.2)";
          }
          return (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:4,
              borderRadius:8, border:"1px solid", padding:"4px 8px",
              fontSize:12, fontWeight:500, ...style,
            }}>
              {cmdIcon[step.cmd]}
              <span className="font-mono-code">×{step.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecordControls({ currentStep, boxCount, busy, onStart, onUndo, onNextBox }) {
  const nextLabel = boxCount > 0 ? `${(currentStep % boxCount) + 1}` : "?";
  return (
    <div className="animate-slide-up" style={{
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:16,
      display:"flex", flexDirection:"column", gap:12,
      animationDelay:"0.15s",
    }}>
      {currentStep > 0 && (
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          borderRadius:8, background:"hsl(var(--destructive) / 0.1)",
          padding:"8px 12px",
        }}>
          <span className="animate-pulse-dot" style={{
            width:10, height:10, borderRadius:"50%",
            background:"hsl(var(--destructive))", flexShrink:0,
          }} />
          <span style={{ fontSize:14, fontWeight:500, color:"hsl(var(--destructive))" }}>
            Recording segment {currentStep} → {nextLabel}
          </span>
        </div>
      )}

      <div style={{ display:"flex", gap:8 }}>
        <button
          onClick={onStart}
          disabled={busy}
          style={{
            flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            borderRadius:12, padding:"10px 0",
            fontSize:14, fontWeight:600, border:"none",
            background: currentStep > 0 ? "hsl(var(--secondary))" : "hsl(var(--primary))",
            color: currentStep > 0 ? "hsl(var(--secondary-foreground))" : "hsl(var(--primary-foreground))",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.4 : 1,
            boxShadow: currentStep > 0 ? "none" : "0 2px 8px hsl(var(--primary) / 0.25)",
            transition:"all 0.15s",
          }}
        >
          {currentStep > 0 ? <><IconRotateCcw /> Restart</> : <><IconCircle /> Start Recording</>}
        </button>

        {currentStep > 0 && (
          <button
            onClick={onUndo}
            disabled={busy}
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              borderRadius:12, padding:"10px 16px",
              fontSize:14, border:"1px solid hsl(var(--border))",
              background:"hsl(var(--card))", color:"hsl(var(--card-foreground))",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.4 : 1,
              transition:"all 0.15s",
            }}
            title="Undo last click"
          >
            <IconUndo />
          </button>
        )}
      </div>

      {currentStep > 0 && (
        <button
          onClick={onNextBox}
          disabled={busy}
          style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            borderRadius:12, padding:"11px 0",
            fontSize:14, fontWeight:600, border:"none",
            background:"hsl(var(--accent))",
            color:"hsl(var(--accent-foreground))",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.4 : 1,
            boxShadow:"0 2px 8px hsl(152 56% 46% / 0.25)",
            transition:"all 0.15s",
          }}
        >
          <IconCheck /> Box Reached — Save Segment
        </button>
      )}
    </div>
  );
}

function AutoControls({ isRunning, log, onStart, onStop }) {
  return (
    <div className="animate-slide-up" style={{
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:16,
      animationDelay:"0.15s",
    }}>
      {!isRunning ? (
        <button
          onClick={onStart}
          style={{
            width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            borderRadius:12, padding:"12px 0",
            fontSize:15, fontWeight:700, border:"none",
            background:"hsl(var(--primary))",
            color:"hsl(var(--primary-foreground))",
            boxShadow:"0 4px 16px hsl(var(--primary) / 0.3)",
            cursor:"pointer", transition:"all 0.15s",
          }}
        >
          <IconPlay /> Start Auto Drive
        </button>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:12,
            borderRadius:8, background:"hsl(var(--primary) / 0.1)",
            padding:"10px 12px",
          }}>
            <span className="animate-pulse-dot" style={{
              display:"inline-block", flexShrink:0,
            }}><IconNav /></span>
            <span style={{ fontSize:14, fontWeight:500, color:"hsl(var(--primary))", flex:1 }}>
              {log || "Navigating..."}
            </span>
          </div>
          <button
            onClick={onStop}
            style={{
              width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              borderRadius:12, padding:"10px 0",
              fontSize:14, fontWeight:700, border:"none",
              background:"hsl(var(--destructive))",
              color:"hsl(var(--destructive-foreground))",
              cursor:"pointer", transition:"all 0.15s",
            }}
          >
            <IconStop2 /> Emergency Stop
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [mode, setMode]               = useState("control");
  const [status, setStatus]           = useState("STOP");
  const [boxCount, setBoxCount]       = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning]     = useState(false);
  const [log, setLog]                 = useState("");
  const [speed, setSpeed]             = useState(120);
  const [pathPreview, setPathPreview] = useState([]);
  const [busy, setBusy]               = useState(false);
  const [mqttOk, setMqttOk]           = useState(false);

  const pathRef        = useRef([]);
  const autoRunning    = useRef(false);
  const boxCountRef    = useRef(0);
  const busyRef        = useRef(false);
  const handleClickRef = useRef(null);

  useEffect(() => {
    const c = connectMQTT();
    c.on("connect", () => setMqttOk(true));
    c.on("close",   () => setMqttOk(false));
    c.on("offline", () => setMqttOk(false));
  }, []);

  useEffect(() => { boxCountRef.current = boxCount; }, [boxCount]);
  useEffect(() => { busyRef.current = busy; }, [busy]);

  useEffect(() => {
    const keyMap = { ArrowUp:"F", ArrowDown:"B", ArrowLeft:"L", ArrowRight:"R" };
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
      const cmd = keyMap[e.key];
      if (cmd) handleClickRef.current?.(cmd);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleClick = async (cmd) => {
    if (busyRef.current || isRunning) return;
    const isTurn = cmd === "L" || cmd === "R";
    const stepMs = isTurn ? STEP_MS_TURN : STEP_MS_FWD;

    busyRef.current = true;
    setBusy(true);
    setStatus(cmd);

    if (mode === "record") {
      const path = pathRef.current;
      const last = path[path.length - 1];
      if (last && last.cmd === cmd) last.count++;
      else path.push({ cmd, count: 1 });
      setPathPreview([...pathRef.current]);
    }

    sendCommand(`EXEC:${cmd}:${stepMs}`);
    await delay(stepMs + GAP_MS);

    setStatus("STOP");
    busyRef.current = false;
    setBusy(false);
  };

  handleClickRef.current = handleClick;

  const handleStop = () => {
    sendCommand("S");
    setStatus("STOP");
    busyRef.current = false;
    setBusy(false);
    autoRunning.current = false;
    setIsRunning(false);
  };

  const startRecording = () => {
    const n = prompt("Enter number of boxes (2–5):");
    const parsed = parseInt(n || "");
    if (!n || isNaN(parsed) || parsed < 2 || parsed > 5) {
      alert("Enter a number between 2 and 5."); return;
    }
    setBoxCount(parsed);
    boxCountRef.current = parsed;
    setCurrentStep(1);
    pathRef.current = [];
    setPathPreview([]);
    setLog("Recording: Box 1 → Box 2");
  };

  const undoLastClick = () => {
    if (busy) return;
    const path = pathRef.current;
    if (!path.length) return;
    const last = path[path.length - 1];
    if (last.count > 1) last.count--;
    else path.pop();
    setPathPreview([...path]);
  };

  const nextBox = async () => {
    if (busy || !pathRef.current.length) {
      alert("Drive the car to the next box first."); return;
    }
    const bc  = boxCountRef.current;
    const key = `${currentStep}-${(currentStep % bc) + 1}`;

    await fetch("/api/paths", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ key, value: pathRef.current }),
    });

    pathRef.current = [];
    setPathPreview([]);

    if (currentStep < bc) {
      const next = currentStep + 1;
      setCurrentStep(next);
      setLog(`Recording: Box ${next} → ${(next % bc) + 1}`);
      alert(`Saved!\n\nNow drive Box ${next} → ${(next % bc) + 1}`);
    } else {
      setLog("All paths recorded!");
      alert("Recording complete!");
      setMode("control");
      setCurrentStep(0);
    }
  };

  const startAuto = async () => {
    const from = parseInt(prompt("Car is at which box?") || "");
    const to   = parseInt(prompt("Go to which box?")    || "");
    const bc   = boxCountRef.current;
    if (isNaN(from) || isNaN(to)) { alert("Invalid input."); return; }
    if (from === to)               { alert("Already there."); return; }
    if (bc === 0)                  { alert("Record paths first."); return; }

    const res   = await fetch("/api/paths");
    const paths = await res.json();

    autoRunning.current = true;
    setIsRunning(true);
    let current = from;

    while (current !== to && autoRunning.current) {
      const next     = (current % bc) + 1;
      const key      = `${current}-${next}`;
      const commands = paths[key];
      if (!commands?.length) { alert(`Path ${key} not recorded.`); break; }

      setLog(`Travelling: Box ${current} → Box ${next}`);
      for (const step of commands) {
        if (!autoRunning.current) break;
        const isTurn = step.cmd === "L" || step.cmd === "R";
        const stepMs = isTurn ? STEP_MS_TURN : STEP_MS_FWD;
        for (let c = 0; c < step.count; c++) {
          if (!autoRunning.current) break;
          setStatus(step.cmd);
          setLog(`${step.cmd} — ${c + 1} / ${step.count}`);
          sendCommand(`EXEC:${step.cmd}:${stepMs}`);
          await delay(stepMs + GAP_MS);
          setStatus("STOP");
        }
      }
      sendCommand("S");
      await delay(500);
      current = next;
    }

    sendCommand("S");
    setIsRunning(false);
    autoRunning.current = false;
    if (current === to) {
      setLog(`Arrived at Box ${to}!`);
      alert(`Reached Box ${to}!`);
    }
  };

  const stopAuto = () => {
    autoRunning.current = false;
    sendCommand("S"); sendCommand("S");
    setIsRunning(false); setStatus("STOP"); setLog("Stopped.");
  };

  const clearPaths = async () => {
    if (!confirm("Delete all recorded paths?")) return;
    await fetch("/api/paths", { method:"DELETE" });
    setBoxCount(0); boxCountRef.current = 0;
    setCurrentStep(0); pathRef.current = []; setPathPreview([]);
    setLog("All paths cleared.");
  };

  const connectionStatus = mqttOk ? "online" : "offline";
  const robotStatus = busy ? "moving" : "idle";

  return (
    <div className="bg-background" style={{ minHeight:"100vh", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"16px" }}>
      <div className="animate-slide-up" style={{ width:"100%", maxWidth:448, display:"flex", flexDirection:"column", gap:16, paddingTop:8, paddingBottom:32 }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:8, paddingBottom:4 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:40, height:40, borderRadius:12,
              background:"hsl(var(--primary) / 0.1)",
              color:"hsl(var(--primary))",
            }}>
              <IconBot />
            </div>
            <div>
              <h1 style={{ fontSize:18, fontWeight:700, color:"hsl(var(--foreground))", lineHeight:1.2, margin:0 }}>RoboNav</h1>
              <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", margin:0 }}>Autonomous delivery control</p>
            </div>
          </div>
          <StatusBadge status={connectionStatus} label={mqttOk ? "Online" : "Offline"} />
        </div>

        {/* Status strip */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          borderRadius:12, border:"1px solid hsl(var(--border))",
          background:"hsl(var(--card))", padding:"10px 16px",
        }}>
          <StatusBadge status={robotStatus} label={busy ? "Moving" : "Idle"} />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {boxCount > 0 && (
              <span className="font-mono-code" style={{
                fontSize:12, fontWeight:500, color:"hsl(var(--muted-foreground))",
                background:"hsl(var(--secondary))", borderRadius:6, padding:"2px 8px",
              }}>
                {boxCount} boxes
              </span>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:4, color:"hsl(var(--muted-foreground))", fontSize:12 }}>
              <IconKeyboard />
              <span>Arrow keys</span>
            </div>
          </div>
        </div>

        {/* Mode selector */}
        <ModeSelector
          mode={mode}
          onChange={(m) => { if (!isRunning && !busy) setMode(m); }}
          disabled={isRunning || busy}
        />

        {/* Speed */}
        {(mode === "control" || mode === "record") && (
          <SpeedControl speed={speed} onChange={(s) => { setSpeed(s); sendCommand(`SPD:${s}`); }} />
        )}

        {/* Log */}
        {log && (
          <div className="animate-slide-up" style={{
            borderRadius:12, background:"hsl(var(--secondary) / 0.6)",
            padding:"10px 16px", fontSize:14, fontWeight:500,
            color:"hsl(var(--secondary-foreground))",
          }}>
            {log}
          </div>
        )}

        {/* Direction pad */}
        <div style={{
          borderRadius:16, border:"1px solid hsl(var(--border))",
          background:"hsl(var(--card))", padding:24,
          display:"flex", flexDirection:"column", alignItems:"center", gap:16,
          boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <DirectionPad
            onDirection={handleClick}
            onStop={handleStop}
            busy={busy}
            isRunning={isRunning}
            activeCmd={status}
          />
          <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", textAlign:"center", margin:0 }}>
            {busy ? "Executing step…" : "Tap or use arrow keys · one tap = one step"}
          </p>
        </div>

        {/* Path preview */}
        {mode === "record" && <PathPreview steps={pathPreview} />}

        {/* Record controls */}
        {mode === "record" && (
          <RecordControls
            currentStep={currentStep}
            boxCount={boxCount}
            busy={busy}
            onStart={startRecording}
            onUndo={undoLastClick}
            onNextBox={nextBox}
          />
        )}

        {/* Auto controls */}
        {mode === "auto" && (
          <AutoControls
            isRunning={isRunning}
            log={log}
            onStart={startAuto}
            onStop={stopAuto}
          />
        )}

        {/* Footer */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 4px" }}>
          <span className="font-mono-code" style={{ fontSize:11, color:"hsl(var(--muted-foreground))" }}>
            Fwd {STEP_MS_FWD}ms · Turn {STEP_MS_TURN}ms
          </span>
          <button
            onClick={clearPaths}
            disabled={busy || isRunning}
            style={{
              display:"flex", alignItems:"center", gap:4,
              fontSize:11, color:"hsl(var(--muted-foreground))",
              background:"none", border:"none", padding:"4px 0",
              cursor: (busy||isRunning) ? "not-allowed" : "pointer",
              transition:"color 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.color="hsl(var(--destructive))"}
            onMouseLeave={e => e.currentTarget.style.color="hsl(var(--muted-foreground))"}
          >
            <IconTrash /> Clear paths
          </button>
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 4px" }}>
          <span className="font-mono-code" style={{ fontSize:11, color:"hsl(var(--muted-foreground))" }}>
            BE Project Group 36
          </span>
          <span className="font-mono-code" style={{ fontSize:11, color:"hsl(var(--muted-foreground))" }}>
            Guide - Dr. R. G. Yelalwar
          </span>
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}