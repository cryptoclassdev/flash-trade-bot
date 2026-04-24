import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generatePineFile } from "shared/pine-gen";

// Read the canonical Pine file at build/request time from the repo root.
// The dashboard app sits at apps/dashboard/; the Pine file is three levels up.
const PINE_PATH = join(
  process.cwd(),
  process.cwd().endsWith("apps/dashboard") ? "../.." : ".",
  "tradingview-strategy.pine",
);

function loadPine(): string {
  return readFileSync(PINE_PATH, "utf8");
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret) {
    return NextResponse.json(
      { error: "Missing ?secret=<hex> query param" },
      { status: 400 },
    );
  }

  let source: string;
  try {
    source = loadPine();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          "Could not load Pine source file. This is a server bug — please report at https://github.com/cryptoclassdev/flash-trade-bot/issues",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }

  let generated: string;
  try {
    generated = generatePineFile({ webhookSecret: secret, pineSource: source });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Pine generation failed" },
      { status: 400 },
    );
  }

  return new NextResponse(generated, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="flash-trade-bot-rsi-divergence.pine"`,
      "cache-control": "no-store",
    },
  });
}
