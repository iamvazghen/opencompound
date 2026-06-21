"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { sepolia, baseSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieStorage, cookieToInitialState, createStorage, http, type Config } from "wagmi";

// projectId is PUBLIC (ships in every dApp bundle, domain-restricted in the Reown dashboard).
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "ca22014226fa6fc1795ff48b236accaf";

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia, baseSepolia];

// Use our OWN RPC endpoints, not Reown's Blockchain API. The default routes chain reads
// (balances, contract calls) through Reown's API keyed by projectId — which returns HTTP 400
// when the project isn't provisioned for that chain, leaving the wallet button stuck loading.
// Pointing transports + customRpcUrls at a real RPC fixes the 400s and the spinner.
const BASE_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC ||
  "https://base-sepolia.g.alchemy.com/v2/AJiObGP0fK8EArUzVjOoN";
const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC || "https://ethereum-sepolia-rpc.publicnode.com";

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [baseSepolia.id]: http(BASE_SEPOLIA_RPC),
    [sepolia.id]: http(SEPOLIA_RPC),
  },
  customRpcUrls: {
    "eip155:84532": [{ url: BASE_SEPOLIA_RPC }],
    "eip155:11155111": [{ url: SEPOLIA_RPC }],
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
