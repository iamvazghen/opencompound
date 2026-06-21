"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, baseSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieStorage, cookieToInitialState, createStorage, type Config } from "wagmi";

// projectId is PUBLIC (ships in every dApp bundle, domain-restricted in the Reown dashboard).
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "ca22014226fa6fc1795ff48b236accaf";

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, baseSepolia];

// SSR-correct setup (per Reown's Next.js guide): cookie storage + ssr:true so the wallet
// connection state is available on the server, matching the client and killing hydration
// mismatches + the connect/loading flash.
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
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
  features: { analytics: false, email: false, socials: [] },
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
