"use client";

import { useEffect, useState, useRef } from "react";
import { connectMQTT, sendCommand } from "@/lib/mqtt";

// =====================================================
// CALIBRATION GUIDE
// =====================================================
// STEP 1 — Set speed slider to 120 and do NOT change it during calibration
//
// STEP 2 — Calibrate STEP_MS_FWD (forward distance per click):
//   • Place car on your actual demo floor
//   • Press forward arrow once
//   • Measure distance car travelled in cm
//   • If too far  → reduce STEP_MS_FWD (e.g. 300 → 250)
//   • If too short → increase STEP_MS_FWD (e.g. 300 → 400)
//   • Target: 1 click = 15 to 20 cm (easy to count clicks for any distance)
//
// STEP 3 — Calibrate STEP_MS_TURN (degrees per click):
//   • Press left arrow once
//   • Check how many degrees car turned
//   • If too much → reduce STEP_MS_TURN
//   • If too little → increase STEP_MS_TURN
//   • Target: 1 click = 45 degrees (so 4 clicks = full 180 degree turn)
//   • OR target 2 clicks = 90 degrees — whichever feels natural
//
// STEP 4 — Calibrate GAP_MS (stop gap between clicks):
//   • Press forward twice quickly
//   • Watch if car fully stops between the two steps
//   • If car still rolling when second step starts → increase GAP_MS
//   • If gap feels too long → reduce GAP_MS
//   • Typical value: 400 to 600 ms
//
// IMPORTANT: Always record AND replay at the same speed slider value
// =====================================================

const STEP_MS_FWD  = 1050;  // ms per forward/backward click — tune this first
const STEP_MS_TURN = 800;  // ms per left/right click — tune this second
const GAP_MS       = 500;  // ms pause between clicks — car must fully stop

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

  const pathRef       = useRef([]);
  const autoRunning   = useRef(false);
  const boxCountRef   = useRef(0);
  const busyRef       = useRef(false);
  const handleClickRef = useRef(null); // always points to latest handleClick

  useEffect(() => {
    connectMQTT();
  }, []);

  useEffect(() => {
    boxCountRef.current = boxCount;
  }, [boxCount]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // ===== KEYBOARD LISTENER =====
  // Runs once only — uses handleClickRef so it always calls
  // the latest version of handleClick without stale closure issues
  useEffect(() => {
    const keyMap = {
      ArrowUp:    "F",
      ArrowDown:  "B",
      ArrowLeft:  "L",
      ArrowRight: "R",
    };

    const handleKeyDown = (e) => {
      if (e.repeat) return;

      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
        e.preventDefault();
      }

      const cmd = keyMap[e.key];
      if (!cmd) return;

      // Use ref — always calls latest handleClick with correct state
      handleClickRef.current(cmd);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []); // empty array — register once only

  // ===== CLICK HANDLER =====
  const handleClick = async (cmd) => {
    if (busyRef.current) return; // ignore if already moving
    if (isRunning) return;       // ignore during auto mode

    const isTurn = cmd === "L" || cmd === "R";
    const stepMs = isTurn ? STEP_MS_TURN : STEP_MS_FWD;

    // Mark busy — prevents double clicks
    busyRef.current = true;
    setBusy(true);
    setStatus(cmd);

    // Record the click in record mode
    if (mode === "record") {
      const path = pathRef.current;
      const last = path[path.length - 1];
      if (last && last.cmd === cmd) {
        last.count++;
      } else {
        path.push({ cmd, count: 1 });
      }
      setPathPreview([...pathRef.current]);
    }

    // Send EXEC — ESP32 runs motor for stepMs internally
    sendCommand(`EXEC:${cmd}:${stepMs}`);

    // Wait for step + gap before allowing next click
    await delay(stepMs + GAP_MS);

    setStatus("STOP");
    busyRef.current = false;
    setBusy(false);
  };

  // Keep ref pointing to latest handleClick on every render
  handleClickRef.current = handleClick;

  // ===== EMERGENCY STOP =====
  const handleStop = () => {
    sendCommand("S");
    setStatus("STOP");
    busyRef.current = false;
    setBusy(false);
    autoRunning.current = false;
    setIsRunning(false);
  };

  // ===== START RECORDING =====
  const startRecording = () => {
    const n = prompt("Enter number of boxes (max 5):");
    const parsed = parseInt(n);
    if (!n || isNaN(parsed) || parsed < 2 || parsed > 5) {
      alert("Enter a number between 2 and 5.");
      return;
    }

    setBoxCount(parsed);
    boxCountRef.current = parsed;
    setCurrentStep(1);
    pathRef.current     = [];
    setPathPreview([]);
    setLog("Recording: Drive Box 1 → Box 2");

    alert(
      "Recording  Box 1 → Box 2\n\n" +
      "HOW TO DRIVE:\n" +
      "• Each key/button press = one fixed step\n" +
      "• Wait for car to fully stop before pressing again\n" +
      "• You can see your recorded path on screen\n" +
      "• Use UNDO if you make a wrong press\n\n" +
      "Press OK to begin"
    );
  };

  // ===== UNDO LAST CLICK =====
  const undoLastClick = () => {
    if (busy) return;
    const path = pathRef.current;
    if (path.length === 0) return;

    const last = path[path.length - 1];
    if (last.count > 1) {
      last.count--;
    } else {
      path.pop();
    }
    setPathPreview([...path]);
  };

  // ===== BOX REACHED — save segment =====
  const nextBox = async () => {
    if (busy) return;
    if (pathRef.current.length === 0) {
      alert("No moves recorded yet. Drive the car to the next box first.");
      return;
    }

    const bc  = boxCountRef.current;
    const key = `${currentStep}-${(currentStep % bc) + 1}`;

    console.log("Saving:", key, pathRef.current);

    await fetch("/api/paths", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ key, value: pathRef.current }),
    });

    pathRef.current = [];
    setPathPreview([]);

    if (currentStep < bc) {
      const next     = currentStep + 1;
      const nextDest = (next % bc) + 1;
      setCurrentStep(next);
      setLog(`Recording: Drive Box ${next} → ${nextDest}`);
      alert(`Saved!\n\nNow drive Box ${next} → ${nextDest}`);
    } else {
      setLog("All paths recorded!");
      alert("Recording complete! All paths saved.");
      setMode("control");
      setCurrentStep(0);
    }
  };

  // ===== AUTO DRIVE =====
  const startAuto = async () => {
    const fromStr = prompt("Which box is the car at now? (number)");
    const toStr   = prompt("Which box should the car go to? (number)");
    const from    = parseInt(fromStr);
    const to      = parseInt(toStr);
    const bc      = boxCountRef.current;

    if (isNaN(from) || isNaN(to)) { alert("Invalid box number."); return; }
    if (from === to)               { alert("Car is already at that box."); return; }
    if (bc === 0)                  { alert("No paths recorded. Record paths first."); return; }

    const res   = await fetch("/api/paths");
    const paths = await res.json();

    autoRunning.current = true;
    setIsRunning(true);

    let current = from;

    while (current !== to && autoRunning.current) {
      const next     = (current % bc) + 1;
      const key      = `${current}-${next}`;
      const commands = paths[key];

      if (!commands || commands.length === 0) {
        alert(`Path ${key} not found. Please record it first.`);
        break;
      }

      setLog(`Travelling: Box ${current} → Box ${next}`);
      await replaySegment(commands);

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

  // ===== REPLAY SEGMENT =====
  const replaySegment = async (commands) => {
    for (let i = 0; i < commands.length; i++) {
      if (!autoRunning.current) break;

      const step   = commands[i];
      const isTurn = step.cmd === "L" || step.cmd === "R";
      const stepMs = isTurn ? STEP_MS_TURN : STEP_MS_FWD;

      for (let c = 0; c < step.count; c++) {
        if (!autoRunning.current) break;

        setStatus(step.cmd);
        setLog(`${step.cmd} — click ${c + 1} of ${step.count}`);

        // EXEC — ESP32 handles timing internally, no network delay
        sendCommand(`EXEC:${step.cmd}:${stepMs}`);

        // Wait exactly same as recording
        await delay(stepMs + GAP_MS);

        setStatus("STOP");
      }
    }

    sendCommand("S");
    await delay(200);
  };

  // ===== STOP AUTO =====
  const stopAuto = () => {
    autoRunning.current = false;
    sendCommand("S");
    sendCommand("S");
    setIsRunning(false);
    setStatus("STOP");
    setLog("Stopped.");
  };

  // ===== CLEAR ALL PATHS =====
  const clearPaths = async () => {
    if (!confirm("Delete all recorded paths?")) return;
    await fetch("/api/paths", { method: "DELETE" });
    setBoxCount(0);
    boxCountRef.current = 0;
    setCurrentStep(0);
    pathRef.current = [];
    setPathPreview([]);
    setLog("All paths cleared.");
  };

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ===== RENDER =====
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white gap-4 p-4">

      <h1 className="text-2xl font-bold">Robot System</h1>

      {/* Calibration values display */}
      <div className="text-xs text-gray-600 text-center">
        Fwd: {STEP_MS_FWD}ms · Turn: {STEP_MS_TURN}ms · Gap: {GAP_MS}ms
      </div>

      {/* Mode buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => { if (!isRunning && !busy) setMode("control"); }}
          className={`px-4 py-2 rounded font-semibold transition-colors ${
            mode === "control" ? "bg-green-500" : "bg-green-900 hover:bg-green-700"
          }`}
        >Control</button>
        <button
          onClick={() => { if (!isRunning && !busy) setMode("record"); }}
          className={`px-4 py-2 rounded font-semibold transition-colors ${
            mode === "record" ? "bg-yellow-500 text-black" : "bg-yellow-900 hover:bg-yellow-700"
          }`}
        >Record</button>
        <button
          onClick={() => { if (!isRunning && !busy) setMode("auto"); }}
          className={`px-4 py-2 rounded font-semibold transition-colors ${
            mode === "auto" ? "bg-blue-500" : "bg-blue-900 hover:bg-blue-700"
          }`}
        >Auto</button>
      </div>

      {/* Status */}
      <div className="text-sm text-gray-400 text-center">
        Mode: <span className="text-white font-semibold">{mode}</span>
        {" · "}
        {busy
          ? <span className="text-yellow-400 font-semibold animate-pulse">Moving...</span>
          : <span className="text-white font-semibold">{status}</span>
        }
        {boxCount > 0 && (
          <span>{" · "}Boxes: <span className="text-white font-semibold">{boxCount}</span></span>
        )}
        {mode === "record" && currentStep > 0 && (
          <span>{" · "}Step: <span className="text-yellow-400 font-semibold">{currentStep}</span></span>
        )}
      </div>

      {/* Log */}
      {log !== "" && (
        <div className="text-xs text-yellow-300 bg-yellow-950 border border-yellow-700 px-3 py-1 rounded w-full max-w-xs text-center">
          {log}
        </div>
      )}

      {/* Speed slider */}
      {(mode === "control" || mode === "record") && (
        <div className="flex items-center gap-3 text-sm w-full max-w-xs">
          <span className="text-gray-400 w-14 shrink-0">Speed</span>
          <input
            type="range" min={60} max={200} value={speed}
            onChange={(e) => {
              const s = parseInt(e.target.value);
              setSpeed(s);
              sendCommand(`SPD:${s}`);
            }}
            className="flex-1"
          />
          <span className="w-8 text-right text-white font-semibold">{speed}</span>
        </div>
      )}

      {/* Control pad */}
      <div className="grid grid-cols-3 gap-3 mt-1">
        <div />
        <button
          onClick={() => handleClick("F")}
          disabled={busy || isRunning}
          className="bg-green-600 hover:bg-green-500 active:scale-95 p-5 rounded-xl text-2xl select-none disabled:opacity-40 transition-transform"
        >↑</button>
        <div />

        <button
          onClick={() => handleClick("L")}
          disabled={busy || isRunning}
          className="bg-blue-600 hover:bg-blue-500 active:scale-95 p-5 rounded-xl text-2xl select-none disabled:opacity-40 transition-transform"
        >←</button>

        <button
          onClick={handleStop}
          className="bg-red-700 hover:bg-red-600 p-5 rounded-xl font-bold text-lg select-none"
        >■</button>

        <button
          onClick={() => handleClick("R")}
          disabled={busy || isRunning}
          className="bg-blue-600 hover:bg-blue-500 active:scale-95 p-5 rounded-xl text-2xl select-none disabled:opacity-40 transition-transform"
        >→</button>

        <div />
        <button
          onClick={() => handleClick("B")}
          disabled={busy || isRunning}
          className="bg-green-600 hover:bg-green-500 active:scale-95 p-5 rounded-xl text-2xl select-none disabled:opacity-40 transition-transform"
        >↓</button>
        <div />
      </div>

      <p className="text-xs text-gray-600">
        {busy ? "Wait for step to finish..." : "Tap once = one step · Arrow keys work too"}
      </p>

      {/* Path preview during recording */}
      {mode === "record" && pathPreview.length > 0 && (
        <div className="w-full max-w-xs bg-gray-900 border border-gray-700 rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-2">Recorded path:</div>
          <div className="flex flex-wrap gap-2">
            {pathPreview.map((step, i) => (
              <span
                key={i}
                className={`px-2 py-1 rounded text-xs font-mono font-bold ${
                  step.cmd === "F" || step.cmd === "B"
                    ? "bg-green-900 text-green-300 border border-green-700"
                    : "bg-blue-900 text-blue-300 border border-blue-700"
                }`}
              >
                {step.cmd} ×{step.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Record controls */}
      {mode === "record" && (
        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={startRecording}
            disabled={busy}
            className="bg-yellow-500 text-black px-4 py-2 rounded font-semibold hover:bg-yellow-400 disabled:opacity-40"
          >Start Recording</button>
          <button
            onClick={undoLastClick}
            disabled={busy || pathPreview.length === 0}
            className="bg-gray-700 px-4 py-2 rounded font-semibold hover:bg-gray-600 disabled:opacity-40"
          >↩ Undo</button>
          <button
            onClick={nextBox}
            disabled={busy || currentStep === 0 || pathPreview.length === 0}
            className="bg-purple-600 px-4 py-2 rounded font-semibold hover:bg-purple-500 disabled:opacity-40"
          >Box Reached ✓</button>
        </div>
      )}

      {/* Auto controls */}
      {mode === "auto" && (
        <div className="flex gap-2">
          {!isRunning ? (
            <button
              onClick={startAuto}
              className="bg-blue-600 px-6 py-2 rounded font-semibold hover:bg-blue-500"
            >Start Auto Drive</button>
          ) : (
            <button
              onClick={stopAuto}
              className="bg-red-600 px-6 py-2 rounded font-semibold animate-pulse hover:bg-red-500"
            >⬛ Stop</button>
          )}
        </div>
      )}

      {/* Clear */}
      <button
        onClick={clearPaths}
        disabled={busy || isRunning}
        className="bg-gray-900 border border-gray-700 px-4 py-1 rounded text-sm text-gray-500 hover:text-white hover:border-gray-500 disabled:opacity-40 mt-1"
      >Delete All Paths</button>

    </div>
  );
}