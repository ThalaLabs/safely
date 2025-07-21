export const NETWORK_CHOICES = [
  'aptos-devnet',
  'aptos-testnet',  
  'aptos-mainnet',
  'movement-mainnet',
  'movement-testnet',
  'custom',
] as const;

export type NetworkChoice = typeof NETWORK_CHOICES[number];