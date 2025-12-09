export const NETWORK_CHOICES = [
  'aptos-devnet',
  'aptos-testnet',
  'aptos-mainnet',
  'movement-mainnet',
  'movement-previewnet',
  'movement-testnet',
] as const;

export type NetworkChoice = (typeof NETWORK_CHOICES)[number];
