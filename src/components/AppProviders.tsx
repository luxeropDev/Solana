"use client";

import { Buffer } from "buffer";

// Must run before any browser-side Solana code serializes a transaction.
if (typeof globalThis !== "undefined" && !globalThis.Buffer) {
  globalThis.Buffer = Buffer;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  return children;
}
