import { NextRequest } from "next/server";

// Server-side JSON-RPC proxy. The browser talks to /api/rpc/<chainId>; this forwards to Alchemy
// using a SERVER-ONLY key (process.env.ALCHEMY_API_KEY, no NEXT_PUBLIC), so the key never ships in
// the client bundle. It's also the natural choke point for rate-limiting / method allow-listing.
const UPSTREAM: Record<string, string> = {
  "1": "https://eth-mainnet.g.alchemy.com/v2/",
  "11155111": "https://eth-sepolia.g.alchemy.com/v2/",
  "8453": "https://base-mainnet.g.alchemy.com/v2/",
  "84532": "https://base-sepolia.g.alchemy.com/v2/",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ chain: string }> }) {
  const { chain } = await params;
  const base = UPSTREAM[chain];
  const key = process.env.ALCHEMY_API_KEY;
  if (!base || !key) {
    return Response.json({ error: "unsupported chain or missing key" }, { status: 400 });
  }
  const upstream = await fetch(base + key, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await req.text(),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
