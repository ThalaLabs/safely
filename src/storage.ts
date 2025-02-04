import { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';
import { Network } from '@aptos-labs/ts-sdk';

type Address = {
  alias: string;
  address: string;
};

type SafelyStorage = {
  addresses: Address[];
  multisig?: string;
  network?: Network;
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
  async set(multisigAddress: string) {
    await writeDb((db) => {
      db.multisig = multisigAddress;
    });
  },

  async remove() {
    await writeDb((db) => {
      const prev = db.multisig;
      db.multisig = undefined;
      console.log(`Removed multisig default: "${prev}"`);
    });
  },

  async get(): Promise<string | undefined> {
    return readDb((db) => db.multisig);
  },
};

// **Network Default**
export const NetworkDefault = {
  async set(network: Network) {
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

  async get(): Promise<Network | undefined> {
    return readDb((db) => db.network);
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

export async function ensureNetworkExists(networkOption?: Network): Promise<Network> {
  if (networkOption) {
    return networkOption;
  }

  const storedNetwork = await NetworkDefault.get() ;
  return storedNetwork ? storedNetwork : Network.MAINNET;
}
