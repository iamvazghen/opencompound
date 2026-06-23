// Minimal ABIs for the isolated per-user position system (PositionFactory + LeveragePosition).

export const factoryAbi = [
  { type: "function", name: "positionOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "createPosition", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [{ type: "address" }] },
] as const;

export const positionAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "equity", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "currentLtvBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "breakEvenLtvBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxSafeLtvBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawableSelfRepaying", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawableToSafe", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isSelfRepaying", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "healthFactor", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "leverage", stateMutability: "nonpayable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "drawLiquidity", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "repay", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ type: "uint256" }], outputs: [] },
  { type: "function", name: "close", stateMutability: "nonpayable", inputs: [], outputs: [] },
] as const;
