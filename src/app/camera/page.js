"use client";

import { useEffect, useRef, useState } from "react";

export default function CameraPage() {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);

  const [position, setPosition] = useState("No Red Detected");

  useEffect(() => {
    const interval = setInterval(() => {
      processFrame();
    }, 200); // process every 200ms

    return () => clearInterval(interval);
  }, []);

  const processFrame = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;

    if (!img || !canvas) return;

    const ctx = canvas.getContext("2d");

    // draw image to canvas
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = frame.data;

    let left = 0;
    let center = 0;
    let right = 0;

    const width = canvas.width;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 🔴 RED DETECTION CONDITION
      if (r > 150 && g < 100 && b < 100) {
        const pixelIndex = i / 4;
        const x = pixelIndex % width;

        if (x < width / 3) left++;
        else if (x < (2 * width) / 3) center++;
        else right++;
      }
    }

    // decide position
    if (left > center && left > right) setPosition("LEFT");
    else if (center > left && center > right) setPosition("CENTER");
    else if (right > left && right > center) setPosition("RIGHT");
    else setPosition("No Red Detected");
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-black text-white min-h-screen">

      <h1 className="text-2xl font-bold">Camera Detection</h1>

      {/* CAMERA STREAM */}
      <img
        ref={imgRef}
        src="http://10.105.184.46:81/stream"
        alt="Camera"
        className="w-[320px] border rounded"
      />

      {/* HIDDEN CANVAS */}
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="hidden"
      />

      {/* OUTPUT */}
      <div className="text-xl font-semibold mt-4">
        Red Position: {position}
      </div>

    </div>
  );
}