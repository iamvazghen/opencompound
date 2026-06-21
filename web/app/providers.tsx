"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, baseSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";

// projectId is PUBLIC (ships in every dApp bundle, domain-restricted in the Reown
// dashboard — not a secret). Hardcoded fallback so connect never breaks on a missing
// env injection. Replace with your own from cloud.reown.com for production.
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "ca22014226fa6fc1795ff48b236accaf";

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, baseSepolia];

const wagmiAdapter = new WagmiAdapter({ networks, projectId, ssr: false });

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
    "--w3m-accent": "#10b981",
    "--w3m-border-radius-master": "2px",
  },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
