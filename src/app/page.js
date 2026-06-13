"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT, sendCommand } from "@/lib/mqtt";

// ── Default tick values (editable in Settings panel) ─────────────────────────
const DEFAULT_TICKS = { F: 20, B: 20, L: 90, R: 90 };

// Gap between clicks in auto mode (ms) — counters inertia/friction
const AUTO_GAP_MS = 200;

// ── Inline SVG icons ─────────────────────────────────────────────────────────
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
const IconCircle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
  </svg>
);
const IconZap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
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
const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconSpinner = () => (
  <span style={{ display:"inline-block", width:18, height:18, border:"2.5px solid currentColor", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.6s linear infinite" }} />
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const cn = (...classes) => classes.filter(Boolean).join(" ");

// ── Settings Panel ────────────────────────────────────────────────────────────
function SettingsPanel({ ticks, onSave, onClose }) {
  const [local, setLocal] = useState({ ...ticks });
  const [gapMs, setGapMs] = useState(AUTO_GAP_MS);

  const dirs = [
    { key: "F", label: "Forward", icon: <IconArrowUp size={16} /> },
    { key: "B", label: "Backward", icon: <IconArrowDown size={16} /> },
    { key: "L", label: "Left Turn", icon: <IconArrowLeft size={16} /> },
    { key: "R", label: "Right Turn", icon: <IconArrowRight size={16} /> },
  ];

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:100,
      background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:16,
    }}>
      <div style={{
        width:"100%", maxWidth:400,
        background:"hsl(var(--card))",
        borderRadius:20, border:"1px solid hsl(var(--border))",
        boxShadow:"0 24px 64px rgba(0,0,0,0.2)",
        overflow:"hidden",
      }}>
        {/* Header */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"20px 24px 16px",
          borderBottom:"1px solid hsl(var(--border))",
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ color:"hsl(var(--primary))" }}><IconSettings /></span>
            <h2 style={{ fontSize:16, fontWeight:700, margin:0, color:"hsl(var(--foreground))" }}>Tick Settings</h2>
          </div>
          <button onClick={onClose} style={{
            background:"hsl(var(--secondary))", border:"none", borderRadius:8,
            width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center",
            cursor:"pointer", color:"hsl(var(--muted-foreground))",
          }}>
            <IconX />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:16 }}>

          <p style={{ fontSize:13, color:"hsl(var(--muted-foreground))", margin:0, lineHeight:1.5 }}>
            Each forward/backward click sends encoder ticks. Each left/right click sends target degrees (phone gyro).
          </p>

          {dirs.map(({ key, label, icon }) => (
            <div key={key} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:36, height:36, borderRadius:10,
                background:"hsl(var(--secondary))",
                color:"hsl(var(--foreground))", flexShrink:0,
              }}>
                {icon}
              </div>
              <span style={{ fontSize:14, fontWeight:500, color:"hsl(var(--foreground))", flex:1 }}>{label}</span>
              <input
                type="number"
                min={100} max={50000} step={100}
                value={local[key]}
                onChange={e => setLocal(prev => ({ ...prev, [key]: parseInt(e.target.value) || 100 }))}
                style={{
                  width:90, padding:"7px 10px", borderRadius:8,
                  border:"1px solid hsl(var(--border))",
                  background:"hsl(var(--background))",
                  color:"hsl(var(--foreground))",
                  fontSize:14, fontWeight:600, fontFamily:"monospace",
                  textAlign:"right",
                }}
              />
              <span style={{ fontSize:12, color:"hsl(var(--muted-foreground))", width:32 }}>
                {key === "L" || key === "R" ? "deg" : "ticks"}
              </span>
            </div>
          ))}

          {/* Gap setting */}
          <div style={{
            borderTop:"1px solid hsl(var(--border))",
            paddingTop:16, display:"flex", alignItems:"center", gap:12,
          }}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:36, height:36, borderRadius:10,
              background:"hsl(var(--secondary))",
              color:"hsl(var(--foreground))", flexShrink:0,
            }}>
              <span style={{ fontSize:12 }}>⏱</span>
            </div>
            <span style={{ fontSize:14, fontWeight:500, color:"hsl(var(--foreground))", flex:1 }}>
              Auto Gap (inertia delay)
            </span>
            <input
              type="number"
              min={100} max={3000} step={50}
              value={gapMs}
              onChange={e => setGapMs(parseInt(e.target.value) || 100)}
              style={{
                width:90, padding:"7px 10px", borderRadius:8,
                border:"1px solid hsl(var(--border))",
                background:"hsl(var(--background))",
                color:"hsl(var(--foreground))",
                fontSize:14, fontWeight:600, fontFamily:"monospace",
                textAlign:"right",
              }}
            />
            <span style={{ fontSize:12, color:"hsl(var(--muted-foreground))", width:32 }}>ms</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding:"16px 24px",
          borderTop:"1px solid hsl(var(--border))",
          display:"flex", gap:10,
        }}>
          <button onClick={onClose} style={{
            flex:1, padding:"10px 0", borderRadius:12,
            background:"hsl(var(--secondary))",
            color:"hsl(var(--secondary-foreground))",
            border:"none", fontSize:14, fontWeight:600, cursor:"pointer",
          }}>
            Cancel
          </button>
          <button onClick={() => onSave(local, gapMs)} style={{
            flex:2, padding:"10px 0", borderRadius:12,
            background:"hsl(var(--primary))",
            color:"hsl(var(--primary-foreground))",
            border:"none", fontSize:14, fontWeight:700, cursor:"pointer",
            boxShadow:"0 2px 8px hsl(var(--primary) / 0.3)",
          }}>
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, label }) {
  const colors = {
    online:  "#22c55e",
    offline: "#ef4444",
    moving:  "#f59e0b",
    idle:    "#94a3b8",
  };
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8,
      borderRadius:99, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:"6px 12px",
      boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <span style={{
        width:8, height:8, borderRadius:"50%",
        background: colors[status] || colors.idle,
        display:"inline-block",
        boxShadow: status === "moving" ? `0 0 0 3px ${colors.moving}33` : "none",
      }} />
      <span style={{ fontSize:12, fontWeight:500, color:"hsl(var(--card-foreground))" }}>{label}</span>
    </div>
  );
}

// ── D-Pad Button ──────────────────────────────────────────────────────────────
function DPadButton({ onClick, disabled, active, isStop, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position:"relative",
        display:"flex", alignItems:"center", justifyContent:"center",
        width: isStop ? 48 : 64,
        height: isStop ? 48 : 64,
        borderRadius: 16,
        border: isStop
          ? "1px solid hsl(var(--destructive) / 0.3)"
          : active
            ? "1px solid hsl(var(--primary) / 0.5)"
            : "1px solid hsl(var(--border))",
        background: isStop
          ? "hsl(var(--destructive) / 0.1)"
          : active
            ? "hsl(var(--primary) / 0.08)"
            : "hsl(var(--card))",
        color: isStop ? "hsl(var(--destructive))" : "hsl(var(--card-foreground))",
        boxShadow: active ? "0 0 0 3px hsl(var(--primary) / 0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !isStop ? 0.3 : 1,
        transition:"all 0.12s",
        transform: active ? "scale(0.95)" : "scale(1)",
      }}
    >
      {active && !isStop ? <IconSpinner /> : children}
    </button>
  );
}

// ── Direction Pad ─────────────────────────────────────────────────────────────
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
        <DPadButton onClick={onStop} disabled={false} isStop>
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

// ── Mode Selector ─────────────────────────────────────────────────────────────
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
            fontSize:14, fontWeight:500, border:"none",
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

// ── Speed Control ─────────────────────────────────────────────────────────────
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
      <span style={{ fontSize:13, fontWeight:600, color:"hsl(var(--foreground))", width:28, textAlign:"right", fontFamily:"monospace" }}>
        {speed}
      </span>
    </div>
  );
}

// ── Path Preview ──────────────────────────────────────────────────────────────
function PathPreview({ steps, ticks }) {
  if (!steps.length) return null;
  const cmdIcon = { F:<IconArrowUp size={12}/>, B:<IconArrowDown size={12}/>, L:<IconArrowLeft size={12}/>, R:<IconArrowRight size={12}/> };
  return (
    <div style={{
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:16,
    }}>
      <p style={{ fontSize:11, fontWeight:600, color:"hsl(var(--muted-foreground))", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:12 }}>
        Recorded Path
      </p>
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {steps.map((step, i) => {
          const isTurn = step.cmd === "L" || step.cmd === "R";
          return (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap:4,
              borderRadius:8, border:"1px solid",
              padding:"4px 8px", fontSize:12, fontWeight:500,
              background: isTurn ? "hsl(var(--primary) / 0.1)" : "hsl(152 56% 46% / 0.15)",
              color: isTurn ? "hsl(var(--primary))" : "hsl(152 56% 46%)",
              borderColor: isTurn ? "hsl(var(--primary) / 0.2)" : "hsl(152 56% 46% / 0.2)",
            }}>
              {cmdIcon[step.cmd]}
              <span style={{ fontFamily:"monospace" }}>×{step.count}</span>
              <span style={{ fontSize:10, opacity:0.7 }}>({ticks[step.cmd]}t)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Record Controls ───────────────────────────────────────────────────────────
function RecordControls({ currentStep, boxCount, busy, onStart, onUndo, onNextBox }) {
  return (
    <div style={{
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:16,
      display:"flex", flexDirection:"column", gap:12,
    }}>
      {currentStep > 0 && (
        <div style={{
          display:"flex", alignItems:"center", gap:8,
          borderRadius:8, background:"hsl(var(--destructive) / 0.1)",
          padding:"8px 12px",
        }}>
          <span style={{
            width:10, height:10, borderRadius:"50%",
            background:"hsl(var(--destructive))", flexShrink:0,
            animation:"pulse 1.5s ease infinite",
          }} />
          <span style={{ fontSize:14, fontWeight:500, color:"hsl(var(--destructive))" }}>
            Recording: Box {currentStep} → Box {(currentStep % boxCount) + 1}
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
            title="Undo last click"
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              borderRadius:12, padding:"10px 16px",
              fontSize:14, border:"1px solid hsl(var(--border))",
              background:"hsl(var(--card))", color:"hsl(var(--card-foreground))",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.4 : 1,
              transition:"all 0.15s",
            }}
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
            background:"hsl(152 56% 46%)",
            color:"#fff",
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.4 : 1,
            boxShadow:"0 2px 8px rgba(24,165,88,0.25)",
            transition:"all 0.15s",
          }}
        >
          <IconCheck /> Box Reached — Save Segment
        </button>
      )}
    </div>
  );
}

// ── Auto Controls ─────────────────────────────────────────────────────────────
function AutoControls({ isRunning, log, onStart, onStop }) {
  return (
    <div style={{
      borderRadius:12, border:"1px solid hsl(var(--border))",
      background:"hsl(var(--card))", padding:16,
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
            <IconNav />
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

// ── Main Page ─────────────────────────────────────────────────────────────────
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
  const [showSettings, setShowSettings] = useState(false);

  // Tick values — editable via settings panel
  const [ticks, setTicks]     = useState({ ...DEFAULT_TICKS });
  const [autoGap, setAutoGap] = useState(AUTO_GAP_MS);

  const pathRef        = useRef([]);
  const autoRunning    = useRef(false);
  const boxCountRef    = useRef(0);
  const busyRef        = useRef(false);
  const handleClickRef = useRef(null);
  const ticksRef       = useRef(ticks);
  const autoGapRef     = useRef(autoGap);

  useEffect(() => {
    const c = connectMQTT();
    c.on("connect", () => setMqttOk(true));
    c.on("close",   () => setMqttOk(false));
    c.on("offline", () => setMqttOk(false));
  }, []);

  useEffect(() => { boxCountRef.current = boxCount; }, [boxCount]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { ticksRef.current = ticks; }, [ticks]);
  useEffect(() => { autoGapRef.current = autoGap; }, [autoGap]);

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

  // ── Handle a single click / keypress ────────────────────────────────────────
  // Each click:
  //   1. Sends  EXEC:<cmd>:<ticks>  to ESP32
  //   2. ESP32 runs motor for exactly that many encoder ticks, then stops on its own
  //   3. JS waits for the ESP32 to finish (we estimate ~time needed) + a small gap
  //
  // Waiting time estimate: we don't know exact RPM, so we wait a generous fixed
  // buffer. If your speed/RPM is known you can tighten this. The ESP32 will stop
  // by itself regardless — the JS wait just prevents sending the next command too
  // early.  A safe estimate: (ticks / pulses_per_sec) * 1.3 + autoGap
  // At 120 RPM with 900 ticks/rev → ~1800 ticks/sec → 4000 ticks ≈ 2.2 s
  // We use 3000ms as a generous fixed wait per click so we never overlap.
  // The settings gap (autoGapRef) is added on top for inertia/friction settling.

  const EXEC_WAIT_MS_FWD = 3000;
  const EXEC_WAIT_MS_TURN = 8000; // generous wait for ESP32 to finish one click

  const handleClick = async (cmd) => {
    if (busyRef.current || isRunning) return;

    const clickTicks = ticksRef.current[cmd];

    busyRef.current = true;
    setBusy(true);
    setStatus(cmd);

    // Record click count (with tick snapshot)
    if (mode === "record") {
      const path = pathRef.current;
      const last = path[path.length - 1];
      // Merge consecutive same-direction clicks
      if (last && last.cmd === cmd && last.ticks === clickTicks) {
        last.count++;
      } else {
        path.push({ cmd, count: 1, ticks: clickTicks });
      }
      setPathPreview([...pathRef.current]);
    }

    // Send to ESP32
    sendCommand(`EXEC:${cmd}:${clickTicks}`);

    // Wait for ESP32 to finish + inertia gap
    const waitMs = (cmd === "L" || cmd === "R") ? EXEC_WAIT_MS_TURN : EXEC_WAIT_MS_FWD;
    await delay(waitMs + autoGapRef.current);

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

  // ── Auto mode — replays recorded click sequences ─────────────────────────────
  // Each step has { cmd, count, ticks }.
  // For each click: send EXEC:<cmd>:<ticks>, wait EXEC_WAIT_MS + autoGap.
  // The gap between clicks is the key to letting the robot fully stop before
  // the next command — this counters inertia and friction.
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

        for (let c = 0; c < step.count; c++) {
          if (!autoRunning.current) break;

          setStatus(step.cmd);
          setLog(`${step.cmd} click ${c + 1}/${step.count} — ${step.ticks} ticks`);

          // Send EXEC with the tick count that was recorded for this step
          sendCommand(`EXEC:${step.cmd}:${step.ticks}`);

          // Wait for ESP32 to finish running the motor + inertia gap
          const autoWait = (step.cmd === "L" || step.cmd === "R") ? EXEC_WAIT_MS_TURN : EXEC_WAIT_MS_FWD;
          await delay(autoWait + autoGapRef.current);

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

  const saveSettings = (newTicks, newGap) => {
    setTicks(newTicks);
    setAutoGap(newGap);
    setShowSettings(false);
  };

  return (
    <div className="bg-background" style={{ minHeight:"100vh", display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"16px" }}>
      {showSettings && (
        <SettingsPanel
          ticks={ticks}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div style={{ width:"100%", maxWidth:448, display:"flex", flexDirection:"column", gap:16, paddingTop:8, paddingBottom:32 }}>

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
              <p style={{ fontSize:12, color:"hsl(var(--muted-foreground))", margin:0 }}>Encoder-based delivery control</p>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button
              onClick={() => setShowSettings(true)}
              title="Tick Settings"
              style={{
                display:"flex", alignItems:"center", justifyContent:"center",
                width:36, height:36, borderRadius:10,
                border:"1px solid hsl(var(--border))",
                background:"hsl(var(--card))",
                color:"hsl(var(--muted-foreground))",
                cursor:"pointer",
                transition:"all 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = "hsl(var(--foreground))"}
              onMouseLeave={e => e.currentTarget.style.color = "hsl(var(--muted-foreground))"}
            >
              <IconSettings />
            </button>
            <StatusBadge status={mqttOk ? "online" : "offline"} label={mqttOk ? "Online" : "Offline"} />
          </div>
        </div>

        {/* Tick info strip */}
        <div style={{
          display:"flex", gap:6, flexWrap:"wrap",
          borderRadius:10, border:"1px solid hsl(var(--border))",
          background:"hsl(var(--card))", padding:"8px 12px",
        }}>
          {["F","B","L","R"].map(cmd => {
            const labels = { F:"Fwd", B:"Back", L:"Left", R:"Right" };
            return (
              <div key={cmd} style={{
                display:"flex", alignItems:"center", gap:4,
                fontSize:11, fontFamily:"monospace",
                color:"hsl(var(--muted-foreground))",
              }}>
                <span style={{ fontWeight:600, color:"hsl(var(--foreground))" }}>{labels[cmd]}</span>
                <span>{ticks[cmd]}t</span>
                <span style={{ opacity:0.4 }}>·</span>
              </div>
            );
          })}
          <span style={{ fontSize:11, color:"hsl(var(--muted-foreground))", fontFamily:"monospace" }}>
            Gap {autoGap}ms
          </span>
        </div>

        {/* Status strip */}
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          borderRadius:12, border:"1px solid hsl(var(--border))",
          background:"hsl(var(--card))", padding:"10px 16px",
        }}>
          <StatusBadge status={busy ? "moving" : "idle"} label={busy ? "Moving" : "Idle"} />
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {boxCount > 0 && (
              <span style={{
                fontSize:12, fontWeight:500, color:"hsl(var(--muted-foreground))",
                background:"hsl(var(--secondary))", borderRadius:6, padding:"2px 8px",
                fontFamily:"monospace",
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
          <div style={{
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
            {busy
              ? `Executing… (${ticks[status] || ""}t)`
              : "Tap or use arrow keys · each tap = one encoder step"}
          </p>
        </div>

        {/* Path preview */}
        {mode === "record" && <PathPreview steps={pathPreview} ticks={ticks} />}

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
          <span style={{ fontSize:11, color:"hsl(var(--muted-foreground))", fontFamily:"monospace" }}>
            BE Project Group 36
          </span>
          <a href="/gyro" target="_blank" style={{
            fontSize:11, color:"hsl(var(--primary))", textDecoration:"none", fontFamily:"monospace",
          }}>
            📱 Phone Gyro
          </a>
          <button
            onClick={clearPaths}
            disabled={busy || isRunning}
            style={{
              display:"flex", alignItems:"center", gap:4,
              fontSize:11, color:"hsl(var(--muted-foreground))",
              background:"none", border:"none", padding:"4px 0",
              cursor: (busy||isRunning) ? "not-allowed" : "pointer",
            }}
            onMouseEnter={e => e.currentTarget.style.color="hsl(var(--destructive))"}
            onMouseLeave={e => e.currentTarget.style.color="hsl(var(--muted-foreground))"}
          >
            <IconTrash /> Clear paths
          </button>
        </div>
        <div style={{ display:"flex", justifyContent:"center", padding:"0 4px" }}>
          <span style={{ fontSize:11, color:"hsl(var(--muted-foreground))", fontFamily:"monospace" }}>
            Guide — Dr. R. G. Yelalwar
          </span>
        </div>

      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}