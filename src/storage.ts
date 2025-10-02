import { NetworkChoice } from './constants.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getProfileNetwork } from './profiles.js';

type Address = {
  alias: string;
  address: string;
};

type SafelyStorage = {
  addresses: Address[];
  multisig?: string;
  network?: NetworkChoice;
  profile?: string;
};

// Config path: ~/.safely/config.json
const CONFIG_DIR = path.join(os.homedir(), '.safely');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const defaultData: SafelyStorage = {
  addresses: [],
  multisig: undefined,
  network: undefined,
  profile: undefined,
};

// Ensure config directory exists
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Read config from disk
function readConfig(): SafelyStorage {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...defaultData };
  }

  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...defaultData, ...JSON.parse(data) };
  } catch (error) {
    console.warn(`Warning: Could not read config file, using defaults: ${error}`);
    return { ...defaultData };
  }
}

// Write config to disk atomically
function writeConfig(config: SafelyStorage): void {
  ensureConfigDir();

  const tmpPath = `${CONFIG_PATH}.tmp`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), 'utf8');
    fs.renameSync(tmpPath, CONFIG_PATH);
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw error;
  }
}

// **Helper functions for config operations**
async function readStorage<T>(callback: (config: SafelyStorage) => T): Promise<T> {
  const config = readConfig();
  return callback(config);
}

async function updateStorage(updateFn: (config: SafelyStorage) => void): Promise<void> {
  const config = readConfig();
  updateFn(config);
  writeConfig(config);
}

// Export getDb for backward compatibility (used in account.ts)
export async function getDb(): Promise<{ data: SafelyStorage }> {
  return { data: readConfig() };
}

// **Address Book Operations**
export const AddressBook = {
  async getAll(): Promise<Address[]> {
    return readStorage((config) => config.addresses);
  },

  async add(alias: string, address: string) {
    await updateStorage((config) => {
      config.addresses.push({ alias, address });
    });
  },

  async remove(alias: string) {
    await updateStorage((config) => {
      const index = config.addresses.findIndex((entry) => entry.alias === alias);
      if (index === -1) throw new Error(`Alias "${alias}" not found.`);
      config.addresses.splice(index, 1);
    });
  },

  findAlias(safelyStorage: SafelyStorage, address: string): string | undefined {
    return safelyStorage.addresses.find((entry) => entry.address === address)?.alias;
  },

  findAliasOrReturnAddress(safelyStorage: SafelyStorage, address: string): string {
    return this.findAlias(safelyStorage, address) || address;
  },
};

// **Generic Default Helper**
function createDefaultAccessor<K extends keyof SafelyStorage>(key: K) {
  return {
    async set(value: NonNullable<SafelyStorage[K]>) {
      await updateStorage((config) => {
        config[key] = value;
      });
    },

    async remove() {
      await updateStorage((config) => {
        config[key] = undefined as SafelyStorage[K];
      });
    },

    async get(): Promise<SafelyStorage[K]> {
      return readStorage((config) => config[key]);
    },
  };
}

// **Default Accessors**
export const MultisigDefault = createDefaultAccessor('multisig');
export const NetworkDefault = createDefaultAccessor('network');
export const ProfileDefault = createDefaultAccessor('profile');

// **Generic ensure helper for simple cases**
function createEnsure<T>(accessor: { get: () => Promise<T | undefined> }, errorMessage: string) {
  return async (option?: T): Promise<T> => {
    if (option) return option;
    const stored = await accessor.get();
    if (!stored) throw new Error(errorMessage);
    return stored;
  };
}

export const ensureMultisigAddressExists = createEnsure(
  MultisigDefault,
  'No multisig address provided'
);

export async function ensureNetworkExists(
  networkOption?: NetworkChoice,
  profileOption?: string
): Promise<NetworkChoice> {
  // 1. CLI option
  if (networkOption) {
    return networkOption;
  }

  // 2. Infer from profile
  const profileName = profileOption || (await ProfileDefault.get());
  if (profileName) {
    const network = getProfileNetwork(profileName);
    if (network) {
      return network;
    }
  }

  // 3. Stored default
  const storedNetwork = await NetworkDefault.get();
  if (storedNetwork) {
    return storedNetwork;
  }

  // 4. Hardcoded default
  return 'aptos-mainnet';
}

export const ensureProfileExists = createEnsure(ProfileDefault, 'No profile provided');
