import { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';
import { NetworkChoice } from './constants.js';
import { getConfigPath } from './utils.js';
import fs from 'fs';
import { parse } from 'yaml';

type Address = {
  alias: string;
  address: string;
};

type MultisigConfig = {
  address: string;
  network: NetworkChoice;
};

type SafelyStorage = {
  addresses: Address[];
  multisig?: string;
  multisigConfig?: MultisigConfig;
  network?: NetworkChoice;
  profile?: string;
};

// Initialize DB
const DB_PATH = 'safelyStorage.json';

export async function getDb(): Promise<Low<SafelyStorage>> {
  const defaultData: SafelyStorage = {
    addresses: [],
    multisig: undefined,
    network: undefined,
  };
  const db = await JSONFilePreset<SafelyStorage>(DB_PATH, defaultData);
  await db.read();
  return db;
}

// **Helper functions for database operations**
async function readDb<T>(callback: (db: SafelyStorage) => T): Promise<T> {
  const db = await getDb();
  return callback(db.data);
}

async function writeDb(updateFn: (db: SafelyStorage) => void) {
  const db = await getDb();
  updateFn(db.data);
  await db.write();
}

// **Address Book Operations**
export const AddressBook = {
  async getAll(): Promise<Address[]> {
    return readDb((db) => db.addresses);
  },

  async add(alias: string, address: string) {
    await writeDb((db) => {
      db.addresses.push({ alias, address });
    });
  },

  async remove(alias: string) {
    await writeDb((db) => {
      const index = db.addresses.findIndex((entry) => entry.alias === alias);
      if (index === -1) throw new Error(`Alias "${alias}" not found.`);
      db.addresses.splice(index, 1);
    });
    console.log(`Alias "${alias}" has been removed.`);
  },

  findAlias(safelyStorage: SafelyStorage, address: string): string | undefined {
    return safelyStorage.addresses.find((entry) => entry.address === address)?.alias;
  },

  findAliasOrReturnAddress(safelyStorage: SafelyStorage, address: string): string {
    return this.findAlias(safelyStorage, address) || address;
  },
};

// **Multisig Defaults**
export const MultisigDefault = {
  async set(multisigAddress: string, network?: NetworkChoice) {
    await writeDb((db) => {
      db.multisig = multisigAddress;
      // Store new format if network provided
      if (network) {
        db.multisigConfig = {
          address: multisigAddress,
          network: network,
        };
      }
    });
  },

  async remove() {
    await writeDb((db) => {
      const prev = db.multisig;
      db.multisig = undefined;
      db.multisigConfig = undefined;
      console.log(`Removed multisig default: "${prev}"`);
    });
  },

  async get(): Promise<string | undefined> {
    return readDb((db) => db.multisig);
  },

  async getConfig(): Promise<MultisigConfig | undefined> {
    return readDb((db) => db.multisigConfig);
  },
};

// **Network Default**
export const NetworkDefault = {
  async set(network: NetworkChoice) {
    await writeDb((db) => {
      db.network = network;
    });
  },

  async remove() {
    await writeDb((db) => {
      const prev = db.network;
      db.network = undefined;
      console.log(`Removed network default: "${prev}"`);
    });
  },

  async get(): Promise<NetworkChoice | undefined> {
    return readDb((db) => db.network);
  },
};

// **Profile Default**
export const ProfileDefault = {
  async set(profile: string) {
    await writeDb((db) => {
      db.profile = profile;
    });
  },

  async remove() {
    await writeDb((db) => {
      const prev = db.profile;
      db.profile = undefined;
      console.log(`Removed profile default: "${prev}"`);
    });
  },

  async get(): Promise<string | undefined> {
    return readDb((db) => db.profile);
  },
};

export async function ensureMultisigAddressExists(multisigAddressOption?: string): Promise<string> {
  if (multisigAddressOption) {
    return multisigAddressOption;
  }

  const storedAddress = await MultisigDefault.get();

  if (!storedAddress) {
    throw new Error('No multisig address provided');
  }

  return storedAddress;
}

function inferNetworkFromProfile(profileName?: string): NetworkChoice | undefined {
  if (!profileName) {
    return undefined;
  }

  // Try both config paths to find the profile
  const configPaths = ['.aptos/config.yaml', '.movement/config.yaml'];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const file = fs.readFileSync(configPath, 'utf8');
        const profiles: Record<string, any> = parse(file).profiles;
        const profileData = profiles[profileName];

        if (profileData && profileData.network) {
          const networkName = profileData.network.toLowerCase();

          // Map profile network names to NetworkChoice
          if (configPath.includes('movement')) {
            switch (networkName) {
              case 'testnet':
                return 'movement-testnet';
              case 'mainnet':
                return 'movement-mainnet';
            }
          } else {
            switch (networkName) {
              case 'devnet':
                return 'aptos-devnet';
              case 'testnet':
                return 'aptos-testnet';
              case 'mainnet':
                return 'aptos-mainnet';
            }
          }
        }
      } catch {
        // Continue to next config path if this one fails
        continue;
      }
    }
  }

  return undefined;
}

export async function ensureNetworkExists(
  networkOption?: NetworkChoice,
  profileOption?: string
): Promise<NetworkChoice> {
  if (networkOption) {
    return networkOption;
  }

  // Try to infer from profile first
  const profileName = profileOption || (await ProfileDefault.get());
  if (profileName) {
    const inferredNetwork = inferNetworkFromProfile(profileName);
    if (inferredNetwork) {
      return inferredNetwork;
    }
  }

  const storedNetwork = await NetworkDefault.get();
  return storedNetwork ? storedNetwork : 'aptos-mainnet';
}

export async function ensureProfileExists(profileOption?: string): Promise<string> {
  if (profileOption) {
    return profileOption;
  }

  const storedProfile = await ProfileDefault.get();

  if (!storedProfile) {
    throw new Error('No profile provided');
  }

  return storedProfile;
}

export async function checkNetworkCompatibility(): Promise<{
  compatible: boolean;
  profileNetwork?: NetworkChoice;
  multisigNetwork?: NetworkChoice;
}> {
  const profileName = await ProfileDefault.get();
  const multisigConfig = await MultisigDefault.getConfig();

  if (!profileName || !multisigConfig) {
    return { compatible: false };
  }

  const profileNetwork = inferNetworkFromProfile(profileName);
  if (!profileNetwork) {
    return { compatible: false };
  }

  return {
    compatible: profileNetwork === multisigConfig.network,
    profileNetwork,
    multisigNetwork: multisigConfig.network,
  };
}
