import { readFile, writeFile } from "fs/promises";
import path from "path";

const filePath = path.join(process.cwd(), "data", "paths.json");

// Helper — read current data safely
async function readPaths() {
  try {
    const data = await readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Helper — write data
async function writePaths(data) {
  await writeFile(filePath, JSON.stringify(data, null, 2));
}

// GET — read all paths
export async function GET() {
  const data = await readPaths();
  return Response.json(data);
}

// POST — save one path segment
// Body: { key: "1-2", value: [ {cmd:"F", count:3}, {cmd:"L", count:2} ] }
export async function POST(req) {
  try {
    const { key, value } = await req.json();

    if (!key || !value) {
      return Response.json({ success: false, error: "Missing key or value" }, { status: 400 });
    }

    const data  = await readPaths();
    data[key]   = value;
    await writePaths(data);

    console.log(`Saved path [${key}]:`, value);
    return Response.json({ success: true, key, steps: value.length });

  } catch (err) {
    console.error("POST /api/paths error:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE — clear all paths
export async function DELETE() {
  await writePaths({});
  return Response.json({ success: true });
}