// Stub for optional deps that wagmi/walletconnect/reown reference via dynamic import but
// that aren't installed (they're meant to be optional). Turbopack resolves these aliases
// here so the build doesn't fail on the absent modules.
export default {};
