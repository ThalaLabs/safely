import fs from 'fs';
import { parse } from 'yaml';
import { NetworkChoice } from './constants.js';
import { getConfigPath } from './utils.js';
import { Account, Ed25519PrivateKey, PrivateKey, PrivateKeyVariants } from '@aptos-labs/ts-sdk';
import { initLedgerSigner, getLedgerIndex } from './ledger/ledger.js';
import LedgerSigner from './ledger/LedgerSigner.js';

export interface ProfileInfo {
  name: string;
  network: NetworkChoice;
  address: string;
  fullnode: string;
  source: 'aptos' | 'movement';
}

export interface ConfigProfile {
  network: string;
  rest_url: string;
  account: string;
  // FIXME: private_key PR derivation_path
  private_key?: string;
  derivation_path?: string;
}

export interface ProfileWithSigner {
  signer: Account | LedgerSigner;
  fullnode: string;
}

// FIXME: move this to some other places
function mapNetworkName(network: string, source: 'aptos' | 'movement'): NetworkChoice | null {
  const networkLower = network.toLowerCase();

  if (source === 'movement') {
    switch (networkLower) {
      case 'testnet':
        return 'movement-testnet';
      case 'mainnet':
        return 'movement-mainnet';
      case 'previewnet':
        return 'movement-previewnet';
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
          const address = configProfile.account;

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
          const address = configProfile.account;

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

export function validateProfileNetwork(profileName: string, network: NetworkChoice): void {
  const configPath = getConfigPath(network);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Cannot use profile "${profileName}" with network "${network}". ` +
        `Config file not found at ${configPath}`
    );
  }

  try {
    const file = fs.readFileSync(configPath, 'utf8');
    const profiles: Record<string, ConfigProfile> = parse(file).profiles;
    const profileData = profiles[profileName];

    if (!profileData) {
      const availableProfiles = Object.keys(profiles);
      throw new Error(
        `Profile "${profileName}" not found in ${configPath}. ` +
          `Available profiles: ${availableProfiles.join(', ')}`
      );
    }

    // Validate that the profile's network matches the requested network
    const profileNetwork = network.startsWith('movement-')
      ? mapNetworkName(profileData.network, 'movement')
      : mapNetworkName(profileData.network, 'aptos');

    if (profileNetwork !== network) {
      throw new Error(
        `Profile "${profileName}" is configured for network "${profileData.network}" ` +
          `but --network=${network} was specified. ` +
          `Please use a profile configured for ${network}.`
      );
    }
  } catch (e) {
    if (e instanceof Error) {
      throw e;
    }
    throw new Error(`Failed to validate profile at ${configPath}: ${e}`);
  }
}

function readProfileConfig(profile: string, network: NetworkChoice): ConfigProfile {
  const configPath = getConfigPath(network);

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}`);
  }

  try {
    const file = fs.readFileSync(configPath, 'utf8');
    const profiles: Record<string, ConfigProfile> = parse(file).profiles;
    const profileData = profiles[profile];

    if (!profileData) {
      throw new Error(`Profile "${profile}" not found in ${configPath}`);
    }

    return profileData;
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found in')) {
      throw e;
    }
    throw new Error(`Failed to read config file at ${configPath}: ${e}`);
  }
}

export function getProfileFullnode(profile: string, network: NetworkChoice): string {
  const profileData = readProfileConfig(profile, network);

  // Movement networks don't need the /v1 suffix
  return network.startsWith('movement-') ? profileData.rest_url : profileData.rest_url + '/v1';
}

export async function loadProfile(
  profile: string,
  network: NetworkChoice
): Promise<ProfileWithSigner> {
  const profileData = readProfileConfig(profile, network);

  // Movement networks don't need the /v1 suffix
  const fullnode = network.startsWith('movement-')
    ? profileData.rest_url
    : profileData.rest_url + '/v1';

  if ('private_key' in profileData && profileData.private_key) {
    return {
      fullnode,
      signer: Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(
          PrivateKey.formatPrivateKey(profileData.private_key, PrivateKeyVariants.Ed25519),
          true
        ),
      }),
    };
  } else if ('derivation_path' in profileData && profileData.derivation_path) {
    return {
      fullnode,
      signer: await initLedgerSigner(getLedgerIndex(profileData.derivation_path)),
    };
  } else {
    throw new Error(`Profile "${profile}" has no private key or derivation path`);
  }
}
