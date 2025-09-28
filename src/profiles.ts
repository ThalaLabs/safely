import fs from 'fs';
import { parse } from 'yaml';
import { NetworkChoice } from './constants.js';

export interface ProfileInfo {
  name: string;
  network: NetworkChoice;
  address: string;
  fullnode: string;
  source: 'aptos' | 'movement';
}

interface ConfigProfile {
  network: string;
  rest_url: string;
  private_key?: string;
  derivation_path?: string;
  account?: string;
}

function mapNetworkName(network: string, source: 'aptos' | 'movement'): NetworkChoice | null {
  const networkLower = network.toLowerCase();

  if (source === 'movement') {
    switch (networkLower) {
      case 'testnet':
        return 'movement-testnet';
      case 'mainnet':
        return 'movement-mainnet';
      default:
        return null;
    }
  } else {
    switch (networkLower) {
      case 'devnet':
        return 'aptos-devnet';
      case 'testnet':
        return 'aptos-testnet';
      case 'mainnet':
        return 'aptos-mainnet';
      default:
        return null;
    }
  }
}

function extractAddress(profile: ConfigProfile): string | null {
  // If account is provided, use it
  if (profile.account) {
    return profile.account;
  }

  // If it's a ledger profile, we can't get the address without connecting
  if (profile.derivation_path) {
    return '[Ledger]';
  }

  // If private key is provided, we could derive the address but that would
  // require importing crypto libraries. For now, return placeholder
  if (profile.private_key) {
    return '[Private Key]';
  }

  return null;
}

export function getAllProfiles(): ProfileInfo[] {
  const profiles: ProfileInfo[] = [];

  // Check Aptos config
  const aptosConfigPath = '.aptos/config.yaml';
  if (fs.existsSync(aptosConfigPath)) {
    try {
      const file = fs.readFileSync(aptosConfigPath, 'utf8');
      const config = parse(file);

      if (config.profiles) {
        for (const [name, profile] of Object.entries(config.profiles)) {
          const configProfile = profile as ConfigProfile;
          const network = mapNetworkName(configProfile.network, 'aptos');
          const address = extractAddress(configProfile);

          if (network && address) {
            profiles.push({
              name,
              network,
              address,
              fullnode: configProfile.rest_url,
              source: 'aptos',
            });
          }
        }
      }
    } catch (err) {
      console.error('Error reading Aptos config:', err);
    }
  }

  // Check Movement config
  const movementConfigPath = '.movement/config.yaml';
  if (fs.existsSync(movementConfigPath)) {
    try {
      const file = fs.readFileSync(movementConfigPath, 'utf8');
      const config = parse(file);

      if (config.profiles) {
        for (const [name, profile] of Object.entries(config.profiles)) {
          const configProfile = profile as ConfigProfile;
          const network = mapNetworkName(configProfile.network, 'movement');
          const address = extractAddress(configProfile);

          if (network && address) {
            profiles.push({
              name,
              network,
              address,
              fullnode: configProfile.rest_url,
              source: 'movement',
            });
          }
        }
      }
    } catch (err) {
      console.error('Error reading Movement config:', err);
    }
  }

  return profiles;
}

export function getProfileByName(name: string): ProfileInfo | null {
  const profiles = getAllProfiles();
  return profiles.find((p) => p.name === name) || null;
}
