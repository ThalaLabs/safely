import { NetworkChoice } from './constants.js';

export function getFullnodeUrl(network: NetworkChoice): string {
  switch (network) {
    case 'aptos-mainnet':
      return 'https://api.mainnet.aptoslabs.com/v1';
    case 'aptos-testnet':
      return 'https://api.testnet.aptoslabs.com/v1';
    case 'aptos-devnet':
      return 'https://api.devnet.aptoslabs.com/v1';
    case 'movement-mainnet':
      return 'https://full.mainnet.movementinfra.xyz/v1';
    case 'movement-testnet':
      return 'https://full.testnet.movementinfra.xyz/v1';
    case 'custom':
      throw new Error('Custom network requires an explicit fullnode URL');
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

export function getConfigPath(network: NetworkChoice): string {
  if (network === 'movement-mainnet' || network === 'movement-testnet') {
    return '.movement/config.yaml';
  }
  return '.aptos/config.yaml';
}

export function getExplorerUrl(network: NetworkChoice, path: string): string {
  const networkParam = (() => {
    switch (network) {
      case 'aptos-mainnet':
        return 'mainnet';
      case 'aptos-testnet':
        return 'testnet';
      case 'aptos-devnet':
        return 'devnet';
      case 'movement-mainnet':
        return 'mainnet';
      case 'movement-testnet':
        return 'testnet';
      default:
        return 'custom';
    }
  })();

  if (network === 'movement-mainnet' || network === 'movement-testnet') {
    return `https://explorer.movementlabs.xyz/${path}?network=${networkParam}`;
  }

  return `https://explorer.aptoslabs.com/${path}?network=${networkParam}`;
}
