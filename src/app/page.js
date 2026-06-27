"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT, sendCommand, publishTopic } from "@/lib/mqtt";
import CameraFeed from "@/components/CameraFeed";

// ── Default tick values (used by Record + Auto modes for accuracy) ───────────
const DEFAULT_TICKS = { F: 20, B: 20, L: 90, R: 90 };

// Gap between clicks in auto mode (ms) — counters inertia/friction
const AUTO_GAP_MS = 200;

// Auto-mode forward detour advance (ticks) — middle leg of the square detour
const DETOUR_FWD_TICKS = 50;

// Status-wait timeouts (ms) — generous fallbacks if a "done" is missed
const STATUS_WAIT_FWD = 12000;
const STATUS_WAIT_TURN = 9000;
const RECHECK_WAIT_MS = 4000;

// ── Inline SVG icons ─────────────────────────────────────────────────────────
const IconBot = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" />
    <path d="M12 7v4M8 15h.01M16 15h.01" />
  </svg>
);
const IconGamepad = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" />
    <circle cx="17" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="14" r="1" fill="currentColor" />
    <rect x="2" y="8" width="20" height="8" rx="3" />
  </svg>
);
const IconCircle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
  </svg>
);
const IconZap = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconSettings = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);
const IconArrowUp = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
const IconArrowDown = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
const IconArrowLeft = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>;
const IconArrowRight = ({ size = 24 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
const IconSquare = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>;
const IconUndo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 00-4-4H4" />
  </svg>
);
const IconCheck = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
const IconPlay = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
const IconStop2 = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><rect x="9" y="9" width="6" height="6" fill="currentColor" stroke="none" /></svg>;
const IconNav = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11" /></svg>;
const IconGauge = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 12L8 8" /><circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);
const IconKeyboard = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12" />
  </svg>
);
const IconTrash = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
  </svg>
);
const IconRotateCcw = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" />
  </svg>
);
const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconSpinner = () => (
  <span style={{ display: "inline-block", width: 18, height: 18, border: "2.5px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
);
const IconAlert = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconVolume = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

// ── Helpers ───────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Parse "DET:1|DIST:18.4|ANG:0|REMAIN:14|CMD:F|MODE:drive"
function parseObstacle(msg) {
  const get = (k) => {
    const m = msg.match(new RegExp(`${k}:([^|]*)`));
    return m ? m[1].trim() : null;
  };
  return {
    detected: get("DET") === "1",
    dist: parseFloat(get("DIST")),
    angle: parseInt(get("ANG") || "0", 10),
    remain: parseInt(get("REMAIN") || "0", 10),
    cmd: get("CMD"),
    mode: get("MODE"),
  };
}

// ── Settings Panel ────────────────────────────────────────────────────────────
// Inputs hold RAW STRINGS so the field can be fully cleared while typing
// (the old `parseInt(v)||1` snapped an empty box back to "1"). Values are
// coerced + clamped only on Save.
function SettingsPanel({ ticks, gap, turnSpeed, nudgeSpeed, onSave, onClose }) {
  const [local, setLocal] = useState({
    F: String(ticks.F), B: String(ticks.B), L: String(ticks.L), R: String(ticks.R),
  });
  const [gapMs, setGapMs] = useState(String(gap));
  const [turnS, setTurnS] = useState(String(turnSpeed));
  const [nudgeS, setNudgeS] = useState(String(nudgeSpeed));

  const num = (s, def, min, max) => {
    const n = parseInt(s, 10);
    if (isNaN(n)) return def;
    return Math.min(max, Math.max(min, n));
  };

  const handleSave = () => {
    const newTicks = {
      F: num(local.F, ticks.F, 1, 50000),
      B: num(local.B, ticks.B, 1, 50000),
      L: num(local.L, ticks.L, 1, 360),
      R: num(local.R, ticks.R, 1, 360),
    };
    onSave(
      newTicks,
      num(gapMs, gap, 100, 3000),
      { turn: num(turnS, turnSpeed, 60, 255), nudge: num(nudgeS, nudgeSpeed, 60, 255) }
    );
  };

  const dirs = [
    { key: "F", label: "Forward", icon: <IconArrowUp size={16} /> },
    { key: "B", label: "Backward", icon: <IconArrowDown size={16} /> },
    { key: "L", label: "Left Turn", icon: <IconArrowLeft size={16} /> },
    { key: "R", label: "Right Turn", icon: <IconArrowRight size={16} /> },
  ];

  const inputStyle = {
    width: 90, padding: "7px 10px", borderRadius: 8,
    border: "1px solid hsl(var(--border))", background: "hsl(var(--background))",
    color: "hsl(var(--foreground))", fontSize: 14, fontWeight: 600,
    fontFamily: "monospace", textAlign: "right",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 400, background: "hsl(var(--card))",
        borderRadius: 20, border: "1px solid hsl(var(--border))",
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid hsl(var(--border))",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "hsl(var(--primary))" }}><IconSettings /></span>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "hsl(var(--foreground))" }}>Tick Settings</h2>
          </div>
          <button onClick={onClose} style={{
            background: "hsl(var(--secondary))", border: "none", borderRadius: 8,
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "hsl(var(--muted-foreground))",
          }}>
            <IconX />
          </button>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", margin: 0, lineHeight: 1.5 }}>
            Used by <b>Record</b> &amp; <b>Auto</b> modes. Forward/backward = encoder ticks, left/right = target degrees (phone gyro). Control mode ignores these (hold-to-move).
          </p>

          {dirs.map(({ key, label, icon }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 36, height: 36, borderRadius: 10, background: "hsl(var(--secondary))",
                color: "hsl(var(--foreground))", flexShrink: 0,
              }}>{icon}</div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))", flex: 1 }}>{label}</span>
              <input
                type="text" inputMode="numeric" value={local[key]}
                onChange={e => setLocal(prev => ({ ...prev, [key]: e.target.value.replace(/[^0-9]/g, "") }))}
                style={inputStyle}
              />
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", width: 32 }}>
                {key === "L" || key === "R" ? "deg" : "ticks"}
              </span>
            </div>
          ))}

          <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 10, background: "hsl(var(--secondary))",
              color: "hsl(var(--foreground))", flexShrink: 0,
            }}><span style={{ fontSize: 12 }}>⏱</span></div>
            <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))", flex: 1 }}>Auto Gap (inertia delay)</span>
            <input
              type="text" inputMode="numeric" value={gapMs}
              onChange={e => setGapMs(e.target.value.replace(/[^0-9]/g, ""))}
              style={inputStyle}
            />
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", width: 32 }}>ms</span>
          </div>

          {/* Turn + nudge speeds (used by Record/Auto turns) */}
          <div style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0, lineHeight: 1.5 }}>
              Turn power for the floor you're on — raise both on rough concrete, lower on smooth tile. Forward/back speed is the slider on the main screen.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", flexShrink: 0 }}><IconRotateCcw /></div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))", flex: 1 }}>Turn Speed</span>
              <input type="text" inputMode="numeric" value={turnS}
                onChange={e => setTurnS(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", width: 32 }}>pwm</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, background: "hsl(var(--secondary))", color: "hsl(var(--foreground))", flexShrink: 0 }}><IconZap /></div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--foreground))", flex: 1 }}>Nudge Speed</span>
              <input type="text" inputMode="numeric" value={nudgeS}
                onChange={e => setNudgeS(e.target.value.replace(/[^0-9]/g, ""))} style={inputStyle} />
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", width: 32 }}>pwm</span>
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid hsl(var(--border))", display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", borderRadius: 12, background: "hsl(var(--secondary))",
            color: "hsl(var(--secondary-foreground))", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "10px 0", borderRadius: 12, background: "hsl(var(--primary))",
            color: "hsl(var(--primary-foreground))", border: "none", fontSize: 14, fontWeight: 700,
            cursor: "pointer", boxShadow: "0 2px 8px hsl(var(--primary) / 0.3)",
          }}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, label }) {
  const colors = { online: "#22c55e", offline: "#ef4444", moving: "#f59e0b", idle: "#94a3b8" };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, borderRadius: 99,
      border: "1px solid hsl(var(--border))", background: "hsl(var(--card))",
      padding: "6px 12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: colors[status] || colors.idle,
        display: "inline-block", boxShadow: status === "moving" ? `0 0 0 3px ${colors.moving}33` : "none",
      }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--card-foreground))" }}>{label}</span>
    </div>
  );
}

// ── D-Pad Button (Record mode — tick clicks) ────────────────────────────────────
function DPadButton({ onClick, disabled, active, isStop, children }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        width: isStop ? 48 : 64, height: isStop ? 48 : 64, borderRadius: 16,
        border: isStop ? "1px solid hsl(var(--destructive) / 0.3)"
          : active ? "1px solid hsl(var(--primary) / 0.5)" : "1px solid hsl(var(--border))",
        background: isStop ? "hsl(var(--destructive) / 0.1)"
          : active ? "hsl(var(--primary) / 0.08)" : "hsl(var(--card))",
        color: isStop ? "hsl(var(--destructive))" : "hsl(var(--card-foreground))",
        boxShadow: active ? "0 0 0 3px hsl(var(--primary) / 0.15)" : "0 1px 4px rgba(0,0,0,0.06)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !isStop ? 0.3 : 1, transition: "all 0.12s",
        transform: active ? "scale(0.95)" : "scale(1)",
      }}
    >
      {active && !isStop ? <IconSpinner /> : children}
    </button>
  );
}

// ── Direction Pad (Record — single tick clicks) ─────────────────────────────────
function DirectionPad({ onDirection, onStop, busy, isRunning, activeCmd }) {
  const disabled = busy || isRunning;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <DPadButton onClick={() => onDirection("F")} disabled={disabled} active={busy && activeCmd === "F"}><IconArrowUp /></DPadButton>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <DPadButton onClick={() => onDirection("L")} disabled={disabled} active={busy && activeCmd === "L"}><IconArrowLeft /></DPadButton>
        <DPadButton onClick={onStop} disabled={false} isStop><IconSquare /></DPadButton>
        <DPadButton onClick={() => onDirection("R")} disabled={disabled} active={busy && activeCmd === "R"}><IconArrowRight /></DPadButton>
      </div>
      <DPadButton onClick={() => onDirection("B")} disabled={disabled} active={busy && activeCmd === "B"}><IconArrowDown /></DPadButton>
    </div>
  );
}

// ── Hold Pad (Control mode — press & hold continuous drive) ─────────────────────
function HoldButton({ cmd, onStart, onEnd, active, disabled, children, isStop }) {
  const press = (e) => { e.preventDefault(); if (disabled) return; onStart(cmd); };
  const release = (e) => { if (e) e.preventDefault(); onEnd(cmd); };
  return (
    <button
      onPointerDown={isStop ? undefined : press}
      onPointerUp={isStop ? undefined : release}
      onPointerLeave={isStop ? undefined : release}
      onPointerCancel={isStop ? undefined : release}
      onClick={isStop ? () => onStart("S") : undefined}
      disabled={disabled && !isStop}
      style={{
        position: "relative", display: "flex", alignItems: "center", justifyContent: "center",
        width: isStop ? 52 : 68, height: isStop ? 52 : 68, borderRadius: 16,
        touchAction: "none", userSelect: "none",
        border: isStop ? "1px solid hsl(var(--destructive) / 0.3)"
          : active ? "1px solid hsl(var(--primary) / 0.6)" : "1px solid hsl(var(--border))",
        background: isStop ? "hsl(var(--destructive) / 0.1)"
          : active ? "hsl(var(--primary))" : "hsl(var(--card))",
        color: isStop ? "hsl(var(--destructive))"
          : active ? "hsl(var(--primary-foreground))" : "hsl(var(--card-foreground))",
        boxShadow: active ? "0 0 0 4px hsl(var(--primary) / 0.2)" : "0 1px 4px rgba(0,0,0,0.06)",
        cursor: (disabled && !isStop) ? "not-allowed" : "pointer",
        opacity: (disabled && !isStop) ? 0.35 : 1, transition: "all 0.1s",
        transform: active ? "scale(0.94)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );
}

function HoldPad({ onStart, onEnd, activeCmd, disabled }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <HoldButton cmd="F" onStart={onStart} onEnd={onEnd} active={activeCmd === "F"} disabled={disabled}><IconArrowUp /></HoldButton>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <HoldButton cmd="L" onStart={onStart} onEnd={onEnd} active={activeCmd === "L"} disabled={disabled}><IconArrowLeft /></HoldButton>
        <HoldButton cmd="S" onStart={onStart} onEnd={onEnd} isStop><IconSquare /></HoldButton>
        <HoldButton cmd="R" onStart={onStart} onEnd={onEnd} active={activeCmd === "R"} disabled={disabled}><IconArrowRight /></HoldButton>
      </div>
      <HoldButton cmd="B" onStart={onStart} onEnd={onEnd} active={activeCmd === "B"} disabled={disabled}><IconArrowDown /></HoldButton>
    </div>
  );
}

// ── Mode Selector ─────────────────────────────────────────────────────────────
function ModeSelector({ mode, onChange, disabled }) {
  const modes = [
    { id: "control", label: "Control", icon: <IconGamepad /> },
    { id: "record", label: "Record", icon: <IconCircle /> },
    { id: "auto", label: "Auto", icon: <IconZap /> },
  ];
  return (
    <div style={{ display: "flex", gap: 4, borderRadius: 12, background: "hsl(var(--secondary) / 0.6)", padding: 4 }}>
      {modes.map((m) => (
        <button key={m.id} onClick={() => onChange(m.id)} disabled={disabled}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            borderRadius: 8, padding: "8px 12px", fontSize: 14, fontWeight: 500, border: "none",
            background: mode === m.id ? "hsl(var(--card))" : "transparent",
            color: mode === m.id ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
            boxShadow: mode === m.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, transition: "all 0.2s",
          }}>
          {m.icon}<span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Speed Control ─────────────────────────────────────────────────────────────
function SpeedControl({ speed, onChange }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, borderRadius: 12,
      border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: "10px 16px",
    }}>
      <IconGauge />
      <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>Speed</span>
      <input type="range" min={60} max={255} value={speed}
        onChange={(e) => onChange(parseInt(e.target.value))} style={{ flex: 1 }} />
      <span style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))", width: 28, textAlign: "right", fontFamily: "monospace" }}>{speed}</span>
    </div>
  );
}

// ── Path Preview ──────────────────────────────────────────────────────────────
function PathPreview({ steps, ticks }) {
  if (!steps.length) return null;
  const cmdIcon = { F: <IconArrowUp size={12} />, B: <IconArrowDown size={12} />, L: <IconArrowLeft size={12} />, R: <IconArrowRight size={12} /> };
  return (
    <div style={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Recorded Path</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {steps.map((step, i) => {
          const isTurn = step.cmd === "L" || step.cmd === "R";
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 4, borderRadius: 8, border: "1px solid",
              padding: "4px 8px", fontSize: 12, fontWeight: 500,
              background: isTurn ? "hsl(var(--primary) / 0.1)" : "hsl(152 56% 46% / 0.15)",
              color: isTurn ? "hsl(var(--primary))" : "hsl(152 56% 46%)",
              borderColor: isTurn ? "hsl(var(--primary) / 0.2)" : "hsl(152 56% 46% / 0.2)",
            }}>
              {cmdIcon[step.cmd]}
              <span style={{ fontFamily: "monospace" }}>×{step.count}</span>
              <span style={{ fontSize: 10, opacity: 0.7 }}>({ticks[step.cmd]}t)</span>
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
    <div style={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {currentStep > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 8, background: "hsl(var(--destructive) / 0.1)", padding: "8px 12px" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "hsl(var(--destructive))", flexShrink: 0, animation: "pulse 1.5s ease infinite" }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--destructive))" }}>Recording: Box {currentStep} → Box {(currentStep % boxCount) + 1}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onStart} disabled={busy} style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          borderRadius: 12, padding: "10px 0", fontSize: 14, fontWeight: 600, border: "none",
          background: currentStep > 0 ? "hsl(var(--secondary))" : "hsl(var(--primary))",
          color: currentStep > 0 ? "hsl(var(--secondary-foreground))" : "hsl(var(--primary-foreground))",
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.4 : 1,
          boxShadow: currentStep > 0 ? "none" : "0 2px 8px hsl(var(--primary) / 0.25)", transition: "all 0.15s",
        }}>
          {currentStep > 0 ? <><IconRotateCcw /> Restart</> : <><IconCircle /> Start Recording</>}
        </button>
        {currentStep > 0 && (
          <button onClick={onUndo} disabled={busy} title="Undo last click" style={{
            display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 12, padding: "10px 16px",
            fontSize: 14, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.4 : 1, transition: "all 0.15s",
          }}><IconUndo /></button>
        )}
      </div>
      {currentStep > 0 && (
        <button onClick={onNextBox} disabled={busy} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, padding: "11px 0",
          fontSize: 14, fontWeight: 600, border: "none", background: "hsl(152 56% 46%)", color: "#fff",
          cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.4 : 1, boxShadow: "0 2px 8px rgba(24,165,88,0.25)", transition: "all 0.15s",
        }}><IconCheck /> Box Reached — Save Segment</button>
      )}
    </div>
  );
}

// ── Auto Controls ─────────────────────────────────────────────────────────────
function AutoControls({ isRunning, log, onStart, onStop }) {
  return (
    <div style={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 16 }}>
      {!isRunning ? (
        <button onClick={onStart} style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          borderRadius: 12, padding: "12px 0", fontSize: 15, fontWeight: 700, border: "none",
          background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
          boxShadow: "0 4px 16px hsl(var(--primary) / 0.3)", cursor: "pointer", transition: "all 0.15s",
        }}><IconPlay /> Start Auto Drive</button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 8, background: "hsl(var(--primary) / 0.1)", padding: "10px 12px" }}>
            <IconNav />
            <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--primary))", flex: 1 }}>{log || "Navigating..."}</span>
          </div>
          <button onClick={onStop} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            borderRadius: 12, padding: "10px 0", fontSize: 14, fontWeight: 700, border: "none",
            background: "hsl(var(--destructive))", color: "hsl(var(--destructive-foreground))",
            cursor: "pointer", transition: "all 0.15s",
          }}><IconStop2 /> Emergency Stop</button>
        </div>
      )}
    </div>
  );
}

// ── Forward Distance Display (replaces radar — servo is fixed straight) ──────────
function DistanceDisplay({ fwdDist, detected, stopCm = 50, enabled = true }) {
  // fwdDist: cm (number) or null if no recent reading
  const MAX_CM = 200;
  const STOP_CM = Math.min(stopCm, MAX_CM);
  const WARN_CM = Math.min(Math.round(STOP_CM * 1.6), MAX_CM);

  const valid = fwdDist !== null && fwdDist > 0 && fwdDist < 999;
  const dist = valid ? fwdDist : null;
  const fill = !valid ? 0
    : detected ? 1
      : Math.max(0, 1 - dist / MAX_CM);

  // color: green (safe) → amber (warn) → red (obstacle)
  const barColor = !valid ? "hsl(var(--border))"
    : detected ? "hsl(0 84% 60%)"
      : dist < WARN_CM ? "hsl(38 92% 50%)"
        : "hsl(152 56% 46%)";

  const label = !valid ? "—"
    : detected ? `⚠ ${dist.toFixed(0)} cm`
      : `${dist.toFixed(0)} cm`;

  const sublabel = !enabled ? "Detection OFF"
    : !valid ? "No reading"
      : detected ? "OBSTACLE — STOPPED"
        : dist < STOP_CM ? "Too close"
          : dist < WARN_CM ? "Caution"
            : "Path clear";

  // SVG bar dimensions
  const W = 280, H = 56, BAR_W = W - 32, BAR_H = 14, BAR_X = 16, BAR_Y = 30;
  const dotX = valid ? BAR_X + Math.min(fill, 1) * BAR_W : null;

  return (
    <div style={{
      borderRadius: 16, border: "1px solid hsl(var(--border))",
      background: "hsl(var(--card))",
      padding: "14px 16px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    }}>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>
          ◉ Forward Distance
        </span>
        <span style={{
          fontSize: 22, fontWeight: 800, fontFamily: "monospace", letterSpacing: "-0.5px",
          color: detected ? "hsl(0 84% 60%)" : valid && dist < WARN_CM ? "hsl(38 92% 50%)" : "hsl(var(--foreground))",
        }}>{label}</span>
      </div>

      {/* SVG distance bar */}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        {/* track */}
        <rect x={BAR_X} y={BAR_Y} width={BAR_W} height={BAR_H} rx={BAR_H / 2}
          fill="hsl(var(--secondary))" />
        {/* fill */}
        {valid && (
          <rect x={BAR_X} y={BAR_Y} width={fill * BAR_W} height={BAR_H} rx={BAR_H / 2}
            fill={barColor} opacity="0.85" />
        )}
        {/* stop-zone marker at 25 cm */}
        {(() => {
          const mx = BAR_X + (STOP_CM / MAX_CM) * BAR_W;
          return <line x1={mx} y1={BAR_Y - 4} x2={mx} y2={BAR_Y + BAR_H + 4}
            stroke="hsl(0 84% 60%)" strokeWidth="1.5" strokeDasharray="3,2" opacity="0.6" />;
        })()}
        {/* warn-zone marker at 60 cm */}
        {(() => {
          const mx = BAR_X + (WARN_CM / MAX_CM) * BAR_W;
          return <line x1={mx} y1={BAR_Y - 3} x2={mx} y2={BAR_Y + BAR_H + 3}
            stroke="hsl(38 92% 50%)" strokeWidth="1" strokeDasharray="2,3" opacity="0.5" />;
        })()}
        {/* dot at reading position */}
        {valid && dotX !== null && (
          <>
            {detected && <circle cx={dotX} cy={BAR_Y + BAR_H / 2} r="10" fill="hsl(0 84% 60% / 0.2)">
              <animate attributeName="r" values="8;14;8" dur="1s" repeatCount="indefinite" />
            </circle>}
            <circle cx={dotX} cy={BAR_Y + BAR_H / 2} r={detected ? 7 : 5}
              fill={barColor} stroke="hsl(var(--card))" strokeWidth="1.5" />
          </>
        )}
        {/* labels */}
        <text x={BAR_X} y={BAR_Y - 7} fill="hsl(var(--muted-foreground))" fontSize="9" fontFamily="monospace">0</text>
        <text x={BAR_X + (STOP_CM / MAX_CM) * BAR_W} y={BAR_Y - 7} fill="hsl(0 84% 60%)" fontSize="9" fontFamily="monospace" textAnchor="middle">{STOP_CM}</text>
        <text x={BAR_X + BAR_W} y={BAR_Y - 7} fill="hsl(var(--muted-foreground))" fontSize="9" fontFamily="monospace" textAnchor="end">{MAX_CM}cm</text>
      </svg>

      {/* sub-status */}
      <div style={{
        marginTop: 6, textAlign: "right", fontSize: 11, fontWeight: 600, fontFamily: "monospace",
        color: detected ? "hsl(0 84% 60%)" : valid && dist < WARN_CM ? "hsl(38 92% 50%)" : "hsl(var(--muted-foreground))"
      }}>
        {sublabel}
      </div>
    </div>
  );
}

// ── Obstacle Alert Dialog (Control / Record modes) ──────────────────────────────
function ObstacleAlertDialog({ dist, onDismiss }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 360, background: "hsl(var(--card))", borderRadius: 20,
        border: "1px solid hsl(var(--destructive) / 0.3)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        overflow: "hidden", animation: "slide-up-fade 0.25s ease both",
      }}>
        <div style={{ padding: "24px 24px 16px", textAlign: "center" }}>
          <div style={{
            width: 56, height: 56, margin: "0 auto 14px", borderRadius: "50%",
            background: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--destructive))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><IconAlert /></div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px", color: "hsl(var(--foreground))" }}>Obstacle Detected</h2>
          <p style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", margin: 0, lineHeight: 1.5 }}>
            Something is blocking the path{Number.isFinite(dist) ? ` at about ${dist.toFixed(0)} cm` : ""}. The robot has stopped. Clear the path, then continue driving.
          </p>
          <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: "10px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <IconVolume /> Horn played on robot phone
          </p>
        </div>
        <div style={{ padding: "0 24px 20px" }}>
          <button onClick={onDismiss} autoFocus style={{
            width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
            background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
            fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px hsl(var(--primary) / 0.3)",
          }}>OK  ·  Press Enter</button>
        </div>
      </div>
    </div>
  );
}

// ── Auto Obstacle Dialog (4 options + side picker) ──────────────────────────────
function AutoObstacleDialog({ dist, busyLabel, onChoose }) {
  const [pickSide, setPickSide] = useState(false);
  const opts = [
    { key: "manual", title: "Switch to Manual", desc: "Take over with Control mode", color: "hsl(var(--primary))" },
    { key: "wait", title: "Ask to Move Aside", desc: "Play request, recheck in 5s", color: "hsl(38 92% 50%)" },
    { key: "detour", title: "Try Alternate Path", desc: "Square detour around it", color: "hsl(152 56% 46%)" },
    { key: "continue", title: "Ignore & Continue", desc: "Push on with remaining path", color: "hsl(var(--muted-foreground))" },
  ];
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(5px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        width: "100%", maxWidth: 380, background: "hsl(var(--card))", borderRadius: 20,
        border: "1px solid hsl(var(--border))", boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        overflow: "hidden", animation: "slide-up-fade 0.25s ease both",
      }}>
        <div style={{ padding: "20px 22px 12px", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: "hsl(var(--destructive) / 0.12)", color: "hsl(var(--destructive))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}><IconAlert /></div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "hsl(var(--foreground))" }}>Obstacle in Auto Drive</h2>
            <p style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", margin: "2px 0 0" }}>
              Blocked{Number.isFinite(dist) ? ` at ${dist.toFixed(0)} cm` : ""}. Choose how to proceed.
            </p>
          </div>
        </div>

        {busyLabel && (
          <div style={{ margin: "0 22px 8px", padding: "8px 12px", borderRadius: 10, background: "hsl(var(--primary) / 0.1)", display: "flex", alignItems: "center", gap: 8 }}>
            <IconSpinner /><span style={{ fontSize: 13, color: "hsl(var(--primary))", fontWeight: 500 }}>{busyLabel}</span>
          </div>
        )}

        <div style={{ padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 8, opacity: busyLabel ? 0.5 : 1, pointerEvents: busyLabel ? "none" : "auto" }}>
          {!pickSide ? opts.map(o => (
            <button key={o.key}
              onClick={() => o.key === "detour" ? setPickSide(true) : onChoose(o.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                padding: "12px 14px", borderRadius: 12, border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))", cursor: "pointer", transition: "all 0.12s",
              }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: o.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "hsl(var(--foreground))" }}>{o.title}</span>
                <span style={{ display: "block", fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{o.desc}</span>
              </span>
            </button>
          )) : (
            <>
              <p style={{ fontSize: 13, color: "hsl(var(--foreground))", fontWeight: 600, margin: "4px 4px 2px" }}>Which side is clear to go around?</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => onChoose("detour-L")} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "14px 0", borderRadius: 12, border: "1px solid hsl(var(--primary) / 0.4)",
                  background: "hsl(var(--primary) / 0.08)", color: "hsl(var(--primary))", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}><IconArrowLeft size={18} /> Left</button>
                <button onClick={() => onChoose("detour-R")} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  padding: "14px 0", borderRadius: 12, border: "1px solid hsl(var(--primary) / 0.4)",
                  background: "hsl(var(--primary) / 0.08)", color: "hsl(var(--primary))", fontSize: 14, fontWeight: 700, cursor: "pointer",
                }}>Right <IconArrowRight size={18} /></button>
              </div>
              <button onClick={() => setPickSide(false)} style={{
                marginTop: 4, padding: "8px 0", borderRadius: 10, border: "none", background: "transparent",
                color: "hsl(var(--muted-foreground))", fontSize: 13, cursor: "pointer",
              }}>← Back to options</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Home() {
  const [mode, setMode] = useState("control");
  const [status, setStatus] = useState("STOP");
  const [boxCount, setBoxCount] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [log, setLog] = useState("");
  const [speed, setSpeed] = useState(120);
  const [trim, setTrim] = useState(0);          // straight-line balance (-120..120)
  const [trimSaved, setTrimSaved] = useState(false);
  const [pathPreview, setPathPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mqttOk, setMqttOk] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [ticks, setTicks] = useState({ ...DEFAULT_TICKS });
  const [autoGap, setAutoGap] = useState(AUTO_GAP_MS);
  const [turnSpeed, setTurnSpeed] = useState(120);
  const [nudgeSpeed, setNudgeSpeed] = useState(120);

  // Obstacle detection (runtime, no reflash)
  const [obstacleCm, setObstacleCm] = useState(50);   // danger threshold (cm)
  const [obstacleCmStr, setObstacleCmStr] = useState("50"); // raw input string
  const [obstacleEnabled, setObstacleEnabled] = useState(true);

  // Control-mode hold state
  const [holdCmd, setHoldCmd] = useState(null);

  // Obstacle / distance state (servo is fixed straight — single forward reading)
  const [fwdDist, setFwdDist] = useState(null);       // cm or null
  const [fwdDetected, setFwdDetected] = useState(false);
  const [alertDialog, setAlertDialog] = useState(null);       // {dist}
  const [autoDialog, setAutoDialog] = useState(null);       // {dist}
  const [autoBusyLabel, setAutoBusyLabel] = useState("");

  const pathRef = useRef([]);
  const autoRunning = useRef(false);
  const boxCountRef = useRef(0);
  const busyRef = useRef(false);
  const handleClickRef = useRef(null);
  const ticksRef = useRef(ticks);
  const autoGapRef = useRef(autoGap);
  const modeRef = useRef(mode);
  const holdKeyRef = useRef(null);     // currently held arrow key (control)
  const dialogOpenRef = useRef(false);

  // event-driven waiters
  const statusResolver = useRef(null);
  const recheckResolver = useRef(null);
  const autoChoiceResolver = useRef(null);
  const lastDriveRemain = useRef(0);
  const prevDetRef = useRef(false);   // edge-trigger for the alert
  const obstacleEnabledRef = useRef(true);
  const speedRef = useRef(120);
  const turnSpeedRef = useRef(120);
  const nudgeSpeedRef = useRef(120);
  const obstacleCmRef = useRef(50);

  // ── MQTT connect + subscriptions ─────────────────────────────────────────────
  useEffect(() => {
    const c = connectMQTT();
    c.on("connect", () => {
      setMqttOk(true);
      c.subscribe("robot/obstacle");
      c.subscribe("robot/status");
    });
    c.on("close", () => setMqttOk(false));
    c.on("offline", () => setMqttOk(false));

    const onMsg = (topic, message) => {
      const msg = message.toString();

      if (topic === "robot/status") {
        const s = msg.trim();
        if (statusResolver.current && (s === "done" || s === "obstacle")) {
          const r = statusResolver.current; statusResolver.current = null;
          r({ type: s === "obstacle" ? "obstacle" : "done", remain: lastDriveRemain.current });
        }
        return;
      }

      if (topic === "robot/obstacle") {
        const o = parseObstacle(msg);

        // Always update live distance (angle is always 0 with fixed servo)
        const validDist = (o.dist > 0 && o.dist < 999);
        setFwdDist(validDist ? o.dist : null);
        setFwdDetected(obstacleEnabledRef.current && o.detected);

        // Recheck result (after SCAN) — runs even while a dialog is open
        if (o.mode === "recheck" && recheckResolver.current) {
          const r = recheckResolver.current; recheckResolver.current = null;
          r({ clear: !o.detected, dist: o.dist });
          return;
        }

        // Detection off, or nothing detected → clear edge latch and bail
        if (!obstacleEnabledRef.current || !o.detected) { prevDetRef.current = false; return; }

        // Driving obstacle during AUTO forward → resolve the forward waiter
        if (o.mode === "drive" && autoRunning.current) {
          lastDriveRemain.current = o.remain;
          if (statusResolver.current) {
            const r = statusResolver.current; statusResolver.current = null;
            r({ type: "obstacle", remain: o.remain });
          }
          return;
        }

        // Control mode, or Record forward → alert + horn, EDGE-TRIGGERED
        // (fires once on the 0→1 transition, so it never misses or spams)
        const isManualDrive = (o.mode === "control") || (o.mode === "drive" && !autoRunning.current);
        if (isManualDrive) {
          const rising = !prevDetRef.current;
          prevDetRef.current = true;
          if (rising && !dialogOpenRef.current) {
            holdKeyRef.current = null; setHoldCmd(null);
            publishTopic("robot/audio_cmd", "HORN");   // fire sound immediately
            setAlertDialog({ dist: o.dist });
          }
        }
      }
    };
    c.on("message", onMsg);
    return () => { c.off?.("message", onMsg); };
  }, []);

  useEffect(() => { boxCountRef.current = boxCount; }, [boxCount]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { ticksRef.current = ticks; }, [ticks]);
  useEffect(() => { autoGapRef.current = autoGap; }, [autoGap]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { dialogOpenRef.current = !!(alertDialog || autoDialog); }, [alertDialog, autoDialog]);
  useEffect(() => { obstacleEnabledRef.current = obstacleEnabled; }, [obstacleEnabled]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { turnSpeedRef.current = turnSpeed; }, [turnSpeed]);
  useEffect(() => { nudgeSpeedRef.current = nudgeSpeed; }, [nudgeSpeed]);
  useEffect(() => { obstacleCmRef.current = obstacleCm; }, [obstacleCm]);

  // Push every setting to the ESP whenever (re)connected, so a reflashed or
  // reconnected board always matches the UI (it boots with its own defaults).
  useEffect(() => {
    if (!mqttOk) return;
    sendCommand(`SPD:${speedRef.current}`);
    sendCommand(`SPDT:${turnSpeedRef.current}`);
    sendCommand(`SPDN:${nudgeSpeedRef.current}`);
    sendCommand(`ODIST:${obstacleCmRef.current}`);
    sendCommand(`ODET:${obstacleEnabledRef.current ? 1 : 0}`);
  }, [mqttOk]);

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const keyMap = { ArrowUp: "F", ArrowDown: "B", ArrowLeft: "L", ArrowRight: "R" };

    const onKeyDown = (e) => {
      // Enter dismisses the alert dialog
      if (e.key === "Enter" && alertDialog) { e.preventDefault(); dismissAlert(); return; }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (dialogOpenRef.current) return;
      if (e.repeat) return;
      const cmd = keyMap[e.key];
      if (!cmd) return;

      if (modeRef.current === "control") {
        if (holdKeyRef.current) return;     // one direction at a time
        holdKeyRef.current = e.key;
        setHoldCmd(cmd);
        sendCommand(`DRIVE:${cmd}`);
      } else if (modeRef.current === "record") {
        handleClickRef.current?.(cmd);
      }
    };

    const onKeyUp = (e) => {
      if (modeRef.current === "control" && e.key === holdKeyRef.current) {
        holdKeyRef.current = null;
        setHoldCmd(null);
        sendCommand("S");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [alertDialog]);

  // ── Control-mode hold handlers (pointer) ─────────────────────────────────────
  const onHoldStart = (cmd) => {
    if (cmd === "S") { setHoldCmd(null); sendCommand("S"); return; }
    if (dialogOpenRef.current) return;
    setHoldCmd(cmd);
    sendCommand(`DRIVE:${cmd}`);
  };
  const onHoldEnd = (cmd) => {
    if (holdCmd) { setHoldCmd(null); sendCommand("S"); }
  };

  // ── Record-mode tick click (unchanged EXEC logic) ────────────────────────────
  const EXEC_WAIT_MS_FWD = 3000;
  const EXEC_WAIT_MS_TURN = 8000;

  const handleClick = async (cmd) => {
    if (busyRef.current || isRunning) return;
    const clickTicks = ticksRef.current[cmd];
    busyRef.current = true; setBusy(true); setStatus(cmd);

    if (modeRef.current === "record") {
      const path = pathRef.current;
      const last = path[path.length - 1];
      if (last && last.cmd === cmd && last.ticks === clickTicks) last.count++;
      else path.push({ cmd, count: 1, ticks: clickTicks });
      setPathPreview([...pathRef.current]);
    }

    sendCommand(`EXEC:${cmd}:${clickTicks}`);
    const waitMs = (cmd === "L" || cmd === "R") ? EXEC_WAIT_MS_TURN : EXEC_WAIT_MS_FWD;
    await delay(waitMs + autoGapRef.current);

    setStatus("STOP"); busyRef.current = false; setBusy(false);
  };
  handleClickRef.current = handleClick;

  const handleStop = () => {
    sendCommand("S"); setStatus("STOP");
    busyRef.current = false; setBusy(false);
    autoRunning.current = false; setIsRunning(false);
  };

  // ── Alert dialog dismiss ──────────────────────────────────────────────────────
  const dismissAlert = () => { setAlertDialog(null); };

  // ── Recording flow (unchanged) ───────────────────────────────────────────────
  const startRecording = () => {
    const n = prompt("Enter number of boxes (2–5):");
    const parsed = parseInt(n || "");
    if (!n || isNaN(parsed) || parsed < 2 || parsed > 5) { alert("Enter a number between 2 and 5."); return; }
    setBoxCount(parsed); boxCountRef.current = parsed;
    setCurrentStep(1); pathRef.current = []; setPathPreview([]);
    setLog("Recording: Box 1 → Box 2");
  };
  const undoLastClick = () => {
    if (busy) return;
    const path = pathRef.current; if (!path.length) return;
    const last = path[path.length - 1];
    if (last.count > 1) last.count--; else path.pop();
    setPathPreview([...path]);
  };
  const nextBox = async () => {
    if (busy || !pathRef.current.length) { alert("Drive the car to the next box first."); return; }
    const bc = boxCountRef.current;
    const key = `${currentStep}-${(currentStep % bc) + 1}`;
    await fetch("/api/paths", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: pathRef.current }) });
    pathRef.current = []; setPathPreview([]);
    if (currentStep < bc) {
      const next = currentStep + 1; setCurrentStep(next);
      setLog(`Recording: Box ${next} → ${(next % bc) + 1}`);
      alert(`Saved!\n\nNow drive Box ${next} → ${(next % bc) + 1}`);
    } else {
      setLog("All paths recorded!"); alert("Recording complete!");
      setMode("control"); setCurrentStep(0);
    }
  };

  // ── Event-driven primitives for Auto mode ────────────────────────────────────
  const waitForStatus = (timeoutMs) => new Promise((resolve) => {
    statusResolver.current = resolve;
    setTimeout(() => {
      if (statusResolver.current === resolve) { statusResolver.current = null; resolve({ type: "timeout", remain: 0 }); }
    }, timeoutMs);
  });
  const waitForRecheck = (timeoutMs) => new Promise((resolve) => {
    recheckResolver.current = resolve;
    setTimeout(() => {
      if (recheckResolver.current === resolve) { recheckResolver.current = null; resolve({ clear: false }); }
    }, timeoutMs);
  });
  const askAutoChoice = (dist) => new Promise((resolve) => {
    autoChoiceResolver.current = resolve;
    setAutoBusyLabel("");
    setAutoDialog({ dist });
  });
  const resolveAutoChoice = (choice) => {
    const r = autoChoiceResolver.current; autoChoiceResolver.current = null;
    if (r) r(choice);
  };

  // Send any EXEC step and wait for ESP to report done/obstacle
  const sendExecAndWait = async (cmd, val) => {
    lastDriveRemain.current = 0;
    sendCommand(`EXEC:${cmd}:${val}`);
    const to = (cmd === "L" || cmd === "R") ? STATUS_WAIT_TURN : STATUS_WAIT_FWD;
    return waitForStatus(to);
  };

  // Square detour around obstacle. side = "L" or "R".
  const runDetour = async (side) => {
    const s = side, o = side === "L" ? "R" : "L";
    const seq = [
      { cmd: s, val: 90 }, { cmd: "F", val: DETOUR_FWD_TICKS },
      { cmd: o, val: 90 }, { cmd: "F", val: DETOUR_FWD_TICKS },   // advances along path
      { cmd: o, val: 90 }, { cmd: "F", val: DETOUR_FWD_TICKS },
      { cmd: s, val: 90 },
    ];
    for (const st of seq) {
      if (!autoRunning.current) return;
      setAutoBusyLabel(`Detour: ${st.cmd} ${st.val}${st.cmd === "F" ? "t" : "°"}`);
      await sendExecAndWait(st.cmd, st.val);
      await delay(autoGapRef.current);
    }
  };

  // Drive forward `ticks`, handling obstacles via dialog. Returns "ok" | "aborted".
  const autoForward = async (ticks) => {
    let remaining = ticks;
    while (remaining > 0 && autoRunning.current) {
      const res = await sendExecAndWait("F", remaining);
      if (res.type !== "obstacle") { remaining = 0; break; }   // done/timeout

      // obstacle → ask the user
      const choice = await askAutoChoice(lastDriveRemain.current || remaining);
      const rem = lastDriveRemain.current || remaining;

      if (choice === "manual") {
        resolveDone(); setAutoDialog(null); switchToManual(); return "aborted";
      }
      if (choice === "continue") {
        setAutoDialog(null); remaining = rem; continue;
      }
      if (choice === "wait") {
        setAutoBusyLabel("Asking obstacle to move…");
        publishTopic("robot/audio_cmd", "MOVE");
        await delay(5000);
        setAutoBusyLabel("Rechecking path…");
        sendCommand("SCAN");
        const rc = await waitForRecheck(RECHECK_WAIT_MS);
        if (rc.clear) { setAutoDialog(null); remaining = rem; continue; }
        // still blocked → reopen options
        setAutoBusyLabel("");
        continue; // loop re-sends forward → trips again → dialog reopens with fresh remain
      }
      if (choice === "detour-L" || choice === "detour-R") {
        const sd = choice.endsWith("L") ? "L" : "R";
        await runDetour(sd);
        setAutoDialog(null);
        remaining = Math.max(0, rem - DETOUR_FWD_TICKS);   // account for the 50-tick advance
        continue;
      }
    }
    return "ok";
  };

  const resolveDone = () => { };
  const switchToManual = () => {
    autoRunning.current = false; setIsRunning(false);
    sendCommand("S"); setStatus("STOP");
    setLog("Switched to manual control.");
    setMode("control");
  };

  // ── Auto mode (obstacle-aware) ───────────────────────────────────────────────
  const startAuto = async () => {
    const from = parseInt(prompt("Car is at which box?") || "");
    const to = parseInt(prompt("Go to which box?") || "");
    const bc = boxCountRef.current;
    if (isNaN(from) || isNaN(to)) { alert("Invalid input."); return; }
    if (from === to) { alert("Already there."); return; }
    if (bc === 0) { alert("Record paths first."); return; }

    const res = await fetch("/api/paths");
    const paths = await res.json();

    autoRunning.current = true; setIsRunning(true);
    let current = from;

    while (current !== to && autoRunning.current) {
      const next = (current % bc) + 1;
      const key = `${current}-${next}`;
      const commands = paths[key];
      if (!commands?.length) { alert(`Path ${key} not recorded.`); break; }

      setLog(`Travelling: Box ${current} → Box ${next}`);

      for (const step of commands) {
        if (!autoRunning.current) break;
        for (let c = 0; c < step.count; c++) {
          if (!autoRunning.current) break;
          setStatus(step.cmd);
          setLog(`${step.cmd} ${c + 1}/${step.count} — ${step.ticks}${step.cmd === "L" || step.cmd === "R" ? "°" : "t"}`);

          if (step.cmd === "F") {
            const r = await autoForward(step.ticks);
            if (r === "aborted") return;   // user switched to manual
          } else {
            await sendExecAndWait(step.cmd, step.ticks);
          }
          await delay(autoGapRef.current);
          setStatus("STOP");
        }
      }
      sendCommand("S"); await delay(400);
      current = next;
    }

    sendCommand("S");
    setIsRunning(false); autoRunning.current = false;
    if (current === to) { setLog(`Arrived at Box ${to}!`); alert(`Reached Box ${to}!`); }
  };

  const stopAuto = () => {
    autoRunning.current = false;
    if (statusResolver.current) { const r = statusResolver.current; statusResolver.current = null; r({ type: "timeout", remain: 0 }); }
    setAutoDialog(null); resolveAutoChoice("continue");
    sendCommand("S"); sendCommand("S");
    setIsRunning(false); setStatus("STOP"); setLog("Stopped.");
  };

  const clearPaths = async () => {
    if (!confirm("Delete all recorded paths?")) return;
    await fetch("/api/paths", { method: "DELETE" });
    setBoxCount(0); boxCountRef.current = 0;
    setCurrentStep(0); pathRef.current = []; setPathPreview([]);
    setLog("All paths cleared.");
  };

  const saveSettings = (newTicks, newGap, speeds) => {
    setTicks(newTicks);
    setAutoGap(newGap);
    setTurnSpeed(speeds.turn);
    setNudgeSpeed(speeds.nudge);
    sendCommand(`SPDT:${speeds.turn}`);
    sendCommand(`SPDN:${speeds.nudge}`);
    setShowSettings(false);
  };

  // ── Obstacle controls (real-time) ────────────────────────────────────────────
  const onObstacleCmChange = (raw) => {
    const clean = raw.replace(/[^0-9]/g, "");
    setObstacleCmStr(clean);
    const n = parseInt(clean, 10);
    if (!isNaN(n) && n >= 10 && n <= 200) {
      setObstacleCm(n);
      sendCommand(`ODIST:${n}`);
    }
  };
  const onObstacleCmBlur = () => {
    const n = parseInt(obstacleCmStr, 10);
    const clamped = isNaN(n) ? obstacleCm : Math.min(200, Math.max(10, n));
    setObstacleCm(clamped);
    setObstacleCmStr(String(clamped));
    sendCommand(`ODIST:${clamped}`);
  };
  const toggleObstacle = () => {
    const next = !obstacleEnabled;
    setObstacleEnabled(next);
    sendCommand(`ODET:${next ? 1 : 0}`);
    if (!next) { setAlertDialog(null); setFwdDetected(false); prevDetRef.current = false; }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-background" style={{ minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "12px" }}>
      {showSettings && <SettingsPanel ticks={ticks} gap={autoGap} turnSpeed={turnSpeed} nudgeSpeed={nudgeSpeed} onSave={saveSettings} onClose={() => setShowSettings(false)} />}
      {alertDialog && <ObstacleAlertDialog dist={alertDialog.dist} onDismiss={dismissAlert} />}
      {autoDialog && <AutoObstacleDialog dist={autoDialog.dist} busyLabel={autoBusyLabel} onChoose={resolveAutoChoice} />}

      <div className={"rn-shell" + (mode === "control" ? " rn-control" : "")}>
        <div className="rn-col rn-left">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 12, background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}><IconBot /></div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.2, margin: 0 }}>RoboNav</h1>
              <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", margin: 0 }}>Obstacle-aware delivery control</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowSettings(true)} title="Tick Settings" style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10,
              border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--muted-foreground))",
              cursor: "pointer", transition: "all 0.15s",
            }}><IconSettings /></button>
            <StatusBadge status={mqttOk ? "online" : "offline"} label={mqttOk ? "Online" : "Offline"} />
          </div>
        </div>

        {/* Forward Distance */}
        <DistanceDisplay fwdDist={fwdDist} detected={fwdDetected} stopCm={obstacleCm} enabled={obstacleEnabled} />


        {/* Car POV camera */}
        {/* <CameraFeed defaultIp="10.251.95.46" startStreaming /> */}
        {/* <CameraFeed defaultIp="10.251.95.46" startStreaming aiModel="Xenova/yolos-tiny" /> */}
        <div className="rn-cam"><CameraFeed defaultIp="10.251.95.46" startStreaming rotation={90} /></div>

        </div>{/* /rn-left */}
        <div className="rn-col rn-right">

        {/* Obstacle detection control — toggle + live danger distance */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, borderRadius: 12,
          border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: "10px 14px",
        }}>
          <button onClick={toggleObstacle} title="Toggle obstacle detection" style={{
            position: "relative", width: 46, height: 26, borderRadius: 99, border: "none", flexShrink: 0,
            background: obstacleEnabled ? "hsl(var(--primary))" : "hsl(var(--secondary))",
            cursor: "pointer", transition: "background 0.2s",
          }}>
            <span style={{
              position: "absolute", top: 3, left: obstacleEnabled ? 23 : 3, width: 20, height: 20,
              borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.2s",
            }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>
              Obstacle Detection {obstacleEnabled ? "On" : "Off"}
            </div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              {obstacleEnabled ? "Stops + alerts within danger range" : "No stopping, no alert, no horn"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: obstacleEnabled ? 1 : 0.4 }}>
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Danger</span>
            <input
              type="text" inputMode="numeric" value={obstacleCmStr}
              onChange={(e) => onObstacleCmChange(e.target.value)} onBlur={onObstacleCmBlur}
              disabled={!obstacleEnabled}
              style={{
                width: 56, padding: "6px 8px", borderRadius: 8, border: "1px solid hsl(var(--border))",
                background: "hsl(var(--background))", color: "hsl(var(--foreground))",
                fontSize: 14, fontWeight: 700, fontFamily: "monospace", textAlign: "right",
              }}
            />
            <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>cm</span>
          </div>
        </div>

        {/* Tick info (record/auto only) */}
        {mode !== "control" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderRadius: 10, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: "8px 12px" }}>
            {["F", "B", "L", "R"].map(cmd => {
              const labels = { F: "Fwd", B: "Back", L: "Left", R: "Right" };
              return (
                <div key={cmd} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontFamily: "monospace", color: "hsl(var(--muted-foreground))" }}>
                  <span style={{ fontWeight: 600, color: "hsl(var(--foreground))" }}>{labels[cmd]}</span>
                  <span>{ticks[cmd]}{cmd === "L" || cmd === "R" ? "°" : "t"}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                </div>
              );
            })}
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>Gap {autoGap}ms</span>
          </div>
        )}

        {/* Status strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: "10px 16px" }}>
          <StatusBadge status={(busy || isRunning || holdCmd) ? "moving" : "idle"} label={(busy || isRunning || holdCmd) ? "Moving" : "Idle"} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {boxCount > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: "hsl(var(--muted-foreground))", background: "hsl(var(--secondary))", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace" }}>{boxCount} boxes</span>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "hsl(var(--muted-foreground))", fontSize: 12 }}><IconKeyboard /><span>Arrow keys</span></div>
          </div>
        </div>

        {/* Mode selector */}
        <ModeSelector mode={mode} onChange={(m) => { if (!isRunning && !busy && !holdCmd) { sendCommand("S"); setMode(m); } }} disabled={isRunning || busy} />

        {/* Speed */}
        {(mode === "control" || mode === "record") && (
          <SpeedControl speed={speed} onChange={(s) => { setSpeed(s); sendCommand(`SPD:${s}`); }} />
        )}

        {/* Straight-line trim — fixes consistent left/right veer on F/B */}
        <div style={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground))" }}>Straight-line trim</span>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "hsl(var(--primary))" }}>
              {trim > 0 ? `+${trim}` : trim}
            </span>
          </div>
          <input
            type="range" min={-120} max={120} step={1} value={trim}
            onChange={(e) => { const v = parseInt(e.target.value, 10); setTrim(v); setTrimSaved(false); sendCommand(`SPDBAL:${v}`); }}
            style={{ width: "100%", accentColor: "hsl(var(--primary))" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>
            <span>← veers left</span><span>straight</span><span>veers right →</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1, fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              Adjust until a fixed step drives straight, then save so it sticks after restart.
            </span>
            <button
              onClick={() => { sendCommand(`SPDBALSET:${trim}`); setTrimSaved(true); }}
              style={{
                border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "6px 12px", cursor: "pointer", flexShrink: 0,
                fontSize: 12, fontWeight: 700, background: trimSaved ? "hsl(var(--primary))" : "hsl(var(--card))",
                color: trimSaved ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))", transition: "all 0.15s",
              }}
            >{trimSaved ? "Saved ✓" : "Set as default"}</button>
          </div>
        </div>

        {/* Log */}
        {log && (
          <div style={{ borderRadius: 12, background: "hsl(var(--secondary) / 0.6)", padding: "10px 16px", fontSize: 14, fontWeight: 500, color: "hsl(var(--secondary-foreground))" }}>{log}</div>
        )}

        {/* Drive pad */}
        <div className="rn-pad" style={{ borderRadius: 16, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
          {mode === "control" ? (
            <>
              <HoldPad onStart={onHoldStart} onEnd={onHoldEnd} activeCmd={holdCmd} disabled={isRunning} />
              <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", margin: 0 }}>
                {holdCmd ? "Driving…" : "Press & hold a button or arrow key to drive"}
              </p>
            </>
          ) : (
            <>
              <DirectionPad onDirection={handleClick} onStop={handleStop} busy={busy} isRunning={isRunning} activeCmd={status} />
              <p style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", textAlign: "center", margin: 0 }}>
                {busy ? `Executing… (${ticks[status] || ""}${status === "L" || status === "R" ? "°" : "t"})` : "Tap or use arrow keys · each tap = one step"}
              </p>
            </>
          )}
        </div>

        {/* Record extras */}
        {mode === "record" && <PathPreview steps={pathPreview} ticks={ticks} />}
        {mode === "record" && (
          <RecordControls currentStep={currentStep} boxCount={boxCount} busy={busy} onStart={startRecording} onUndo={undoLastClick} onNextBox={nextBox} />
        )}

        {/* Auto extras */}
        {mode === "auto" && (
          <AutoControls isRunning={isRunning} log={log} onStart={startAuto} onStop={stopAuto} />
        )}

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>BE Project Group 36</span>
          <a href="/gyro" target="_blank" style={{ fontSize: 11, color: "hsl(var(--primary))", textDecoration: "none", fontFamily: "monospace" }}>📱 Phone Gyro</a>
          <button onClick={clearPaths} disabled={busy || isRunning} style={{
            display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "hsl(var(--muted-foreground))",
            background: "none", border: "none", padding: "4px 0", cursor: (busy || isRunning) ? "not-allowed" : "pointer",
          }}><IconTrash /> Clear paths</button>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "0 4px" }}>
          <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>Guide — Dr. R. G. Yelalwar</span>
        </div>
        </div>{/* /rn-right */}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes slide-up-fade { from{opacity:0;transform:translateY(12px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }

        /* ── Responsive layout ───────────────────────────────────── */
        .rn-shell { width: 100%; max-width: 480px; display: flex; flex-direction: column; gap: 14px; padding: 8px 0 32px; }
        .rn-col   { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

        /* Desktop: two columns — media (distance + camera) | controls */
        @media (min-width: 900px) {
          .rn-shell { max-width: 980px; display: grid; align-items: start;
                      grid-template-columns: minmax(0, 460px) minmax(0, 1fr); gap: 20px; padding-bottom: 24px; }
          .rn-left  { position: sticky; top: 12px; }
        }

        /* Mobile: in CONTROL mode, pin the drive pad to the bottom of the
           viewport so the camera (top) and the controls (bottom) are both
           visible at once — no scrolling needed while driving. */
        @media (max-width: 899px) {
          .rn-control { padding-bottom: 250px; }
          .rn-control .rn-pad {
            position: fixed; left: 50%; transform: translateX(-50%); bottom: 10px;
            width: calc(100% - 24px); max-width: 468px; z-index: 50;
            box-shadow: 0 6px 28px rgba(0,0,0,0.22);
          }
        }
      `}</style>
    </div>
  );
}