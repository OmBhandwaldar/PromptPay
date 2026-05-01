"use client";

import {
  NetworkId,
  WalletId,
  WalletManager,
  WalletProvider,
} from "@txnlab/use-wallet-react";

import { ALGOD_TESTNET_URL } from "@/lib/config";

const walletManager = new WalletManager({
  wallets: [WalletId.PERA, WalletId.DEFLY, WalletId.LUTE],
  defaultNetwork: NetworkId.TESTNET,
  options: {
    resetNetwork: true,
  },
  networks: {
    [NetworkId.TESTNET]: {
      algod: {
        baseServer: ALGOD_TESTNET_URL,
        port: "",
        token: "",
      },
    },
    [NetworkId.LOCALNET]: {
      algod: {
        baseServer: "http://localhost",
        port: "4001",
        token: "a".repeat(64),
      },
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return <WalletProvider manager={walletManager}>{children}</WalletProvider>;
}
