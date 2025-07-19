import { Network } from '@aptos-labs/ts-sdk';

export function getFullnodeUrl(network: Network): string {
  switch (network) {
    case Network.MAINNET:
      return 'https://api.mainnet.aptoslabs.com/v1';
    case Network.TESTNET:
      return 'https://api.testnet.aptoslabs.com/v1';
    case Network.DEVNET:
      return 'https://api.devnet.aptoslabs.com/v1';
    case Network.LOCAL:
      return 'http://127.0.0.1:8080/v1';
    case Network.CUSTOM:
      throw new Error('Custom network requires an explicit fullnode URL');
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}