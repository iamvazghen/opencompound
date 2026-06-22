"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, baseSepolia, base, mainnet, type AppKitNetwork } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieStorage, cookieToInitialState, createStorage, http, type Config } from "wagmi";
import { ToastProvider } from "@/components/Toast";

// projectId is PUBLIC (ships in every dApp bundle). Restrict it to your domain(s) in the Reown
// dashboard (Settings → Allowed domains) — that, not secrecy, is what stops other origins reusing it.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "ca22014226fa6fc1795ff48b236accaf";

// One deployment runs in ONE mode. Testnet (default) = Base/Eth Sepolia, wallet Swap/Activity OFF
// (Reown's Blockchain API doesn't serve testnets → those features 400). Mainnet = Base/Eth, features
// ON. Flip with NEXT_PUBLIC_NETWORK_MODE=mainnet once mainnet vaults are deployed.
const MAINNET = process.env.NEXT_PUBLIC_NETWORK_MODE === "mainnet";

const networks = (MAINNET ? [base, mainnet] : [baseSepolia, sepolia]) as [AppKitNetwork, ...AppKitNetwork[]];

// All chain reads go through our own /api/rpc/<id> proxy, which injects a SERVER-ONLY Alchemy key
// (never in the client bundle) and is the place to add rate-limiting later. This also keeps reads off
// Reown's Blockchain API, which 400s on chains the project isn't provisioned for.
const rpc = (id: number) => `/api/rpc/${id}`;
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [base.id]: http(rpc(base.id)),
    [mainnet.id]: http(rpc(mainnet.id)),
    [baseSepolia.id]: http(rpc(baseSepolia.id)),
    [sepolia.id]: http(rpc(sepolia.id)),
  },
  customRpcUrls: {
    "eip155:8453": [{ url: rpc(base.id) }],
    "eip155:1": [{ url: rpc(mainnet.id) }],
    "eip155:84532": [{ url: rpc(baseSepolia.id) }],
    "eip155:11155111": [{ url: rpc(sepolia.id) }],
  },
});

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: "OpenCompound",
    description: "Leveraged & self-repaying vaults on Aave V3",
    url: typeof window !== "undefined" ? window.location.origin : "https://opencompound.app",
    icons: ["https://opencompound.app/favicon.ico"],
  },
  // Chain-conditional: the Blockchain-API-backed features (token prices / history) only work on
  // mainnets, so they're ON in mainnet mode and OFF on testnets (where they'd return HTTP 400).
  features: {
    analytics: true, // Reown's cookieless wallet-funnel telemetry (page analytics via @vercel/analytics)
    email: false,
    socials: [],
    swaps: MAINNET,
    onramp: MAINNET,
    history: MAINNET,
    send: MAINNET,
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#d1a35a",
    "--w3m-border-radius-master": "2px",
  },
});

const queryClient = new QueryClient();

export function Providers({ children, cookies }: { children: React.ReactNode; cookies: string | null }) {
  // Hydrate wagmi from the request cookies so server and client agree on connection state.
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
