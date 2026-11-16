import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

const LAYOUT_PATH = path.join(process.cwd(), "src", "data", "world-layouts.json");

export async function GET() {
  try {
    const raw = fs.readFileSync(LAYOUT_PATH, "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read world-layouts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Persist plot/road calibrations. Never touches public/ image files. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.shared?.plots || !body?.shared?.nodes) {
      return NextResponse.json({ error: "Invalid world-layouts payload" }, { status: 400 });
    }
    const next = {
      version: typeof body.version === "number" ? body.version : 1,
      shared: body.shared,
    };
    fs.writeFileSync(LAYOUT_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
    return NextResponse.json({ ok: true, layout: next });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to write world-layouts";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
