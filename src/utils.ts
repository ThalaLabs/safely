import {
  Aptos,
  AptosConfig,
  WriteSetChange,
  WriteSetChangeWriteModule,
  WriteSetChangeWriteResource,
} from '@aptos-labs/ts-sdk';
import { NetworkChoice } from './constants.js';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

export function getFullnodeUrl(network: NetworkChoice): string {
  switch (network) {
    case 'aptos-mainnet':
      return 'https://rpc.sentio.xyz/aptos/v1';
    case 'aptos-testnet':
      return 'https://api.testnet.aptoslabs.com/v1';
    case 'aptos-devnet':
      return 'https://api.devnet.aptoslabs.com/v1';
    case 'movement-mainnet':
      return 'https://rpc.sentio.xyz/movement/v1';
    case 'movement-testnet':
      return 'https://full.testnet.movementinfra.xyz/v1';
    default:
      throw new Error(`Unknown network: ${network}`);
  }
}

export function initAptos(network: NetworkChoice, fullnode?: string): Aptos {
  return new Aptos(
    new AptosConfig({
      fullnode: fullnode || getFullnodeUrl(network),
    })
  );
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
        throw new Error(`Unknown network: ${network}`);
    }
  })();

  if (network === 'movement-mainnet' || network === 'movement-testnet') {
    return `https://explorer.movementlabs.xyz/${path}?network=${networkParam}`;
  }

  return `https://explorer.aptoslabs.com/${path}?network=${networkParam}`;
}

export async function resolvePayloadInput(payload: string): Promise<string> {
  // Handle stdin
  if (payload === '-') {
    return readFromStdin();
  }

  // Check if it's a file
  try {
    const fullPath = path.resolve(payload);
    if (fs.existsSync(fullPath)) {
      const fileContent = fs.readFileSync(fullPath, 'utf8');

      // Check if it's a YAML file by extension
      const ext = path.extname(fullPath).toLowerCase();
      if (ext === '.yaml' || ext === '.yml') {
        // Parse YAML and convert to JSON
        const parsedYaml = yaml.parse(fileContent);
        return JSON.stringify(parsedYaml);
      }

      // For JSON files or files without extension, return as-is
      return fileContent;
    }
  } catch {
    // If any error occurs checking file, treat as JSON string
  }

  // Return as-is (assume it's JSON string)
  return payload;
}

async function readFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Balance change utilities
interface FungibleStore {
  balance: string;
  metadata: { inner: string };
}

export interface BalanceChange {
  address: string;
  asset: string;
  symbol: string;
  balanceBefore: number;
  balanceAfter: number;
}

export function isWriteSetChangeWriteResource(
  change: WriteSetChange
): change is WriteSetChangeWriteResource {
  return change.type === 'write_resource';
}

export function isWriteSetChangeWriteModule(
  change: WriteSetChange
): change is WriteSetChangeWriteModule {
  return change.type === 'write_module';
}

export async function getStoreOwner(aptos: Aptos, storeAddress: string): Promise<string> {
  const [owner] = await aptos.view<[string]>({
    payload: {
      function: '0x1::object::owner',
      typeArguments: ['0x1::fungible_asset::FungibleStore'],
      functionArguments: [storeAddress],
    },
  });
  return owner;
}

export async function getFABalance(
  aptos: Aptos,
  faMetadata: string,
  accountAddress: string
): Promise<number> {
  const [balance] = await aptos.view<[string]>({
    payload: {
      function: '0x1::primary_fungible_store::balance',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [accountAddress, faMetadata],
    },
  });

  return Number(balance);
}

export async function getFaDecimals(aptos: Aptos, assetType: string): Promise<number> {
  const [decimals] = await aptos.view<[number]>({
    payload: {
      function: '0x1::fungible_asset::decimals',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [assetType],
    },
  });

  return decimals;
}

export async function getFaSymbol(aptos: Aptos, assetType: string): Promise<string> {
  const [symbol] = await aptos.view<[string]>({
    payload: {
      function: '0x1::fungible_asset::symbol',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [assetType],
    },
  });

  return symbol;
}

// FIXME: move balance change related stuff to a separate file
export async function getBalanceChangesData(
  aptos: Aptos,
  changes: WriteSetChange[]
): Promise<BalanceChange[]> {
  if (!changes) {
    return [];
  }

  const resourceChanges = changes.filter(isWriteSetChangeWriteResource);
  const balanceChanges: BalanceChange[] = [];

  for (const resourceChange of resourceChanges) {
    if (resourceChange.data.type !== '0x1::fungible_asset::FungibleStore') {
      continue;
    }
    const faStore = resourceChange.data.data as FungibleStore;
    const faType = faStore.metadata.inner;
    const balanceAfterRaw = Number(faStore.balance);
    const storeAddress = resourceChange.address;
    try {
      const [decimals, symbol, accountAddress] = await Promise.all([
        getFaDecimals(aptos, faType),
        getFaSymbol(aptos, faType),
        getStoreOwner(aptos, storeAddress),
      ]);
      const balanceBeforeRaw = await getFABalance(aptos, faType, accountAddress);

      const balanceAfter = balanceAfterRaw / 10 ** decimals;
      const balanceBefore = balanceBeforeRaw / 10 ** decimals;

      // Only include if balance actually changes
      if (balanceBefore !== balanceAfter) {
        balanceChanges.push({
          address: accountAddress,
          asset: faType,
          symbol,
          balanceBefore,
          balanceAfter,
        });
      }
    } catch (error) {
      continue;
    }
  }

  return balanceChanges;
}

/**
 * Safely stringify objects with BigInt support and vector<u8> conversion to hex.
 * This function handles special cases for Aptos transaction payloads:
 * - Converts BigInt to string
 * - Converts vector<u8> (Uint8Array) to hex string
 * - Converts vector<vector<u8>> (array of Uint8Array) to array of hex strings
 */
export function safeStringify(obj: unknown, indent: number): string {
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }

      // Handle vector<u8> which comes as Uint8Array
      if (value instanceof Uint8Array) {
        return (
          '0x' +
          Array.from(value)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
        );
      }

      // Handle vector<vector<u8>> - array of Uint8Array
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => item instanceof Uint8Array)
      ) {
        return value.map(
          (uint8Array) =>
            '0x' +
            Array.from(uint8Array)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')
        );
      }

      return value;
    },
    indent
  );
}
