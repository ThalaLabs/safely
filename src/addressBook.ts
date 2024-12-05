import { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';

type Address = {
  alias: string;
  address: string;
};

type AddressBook = {
  addresses: Address[];
};

export async function ensureDb(): Promise<Low<AddressBook>> {
  const defaultData: AddressBook = { addresses: [] };
  return await JSONFilePreset<AddressBook>('addressbook.json', defaultData);
}
export async function getAllAddressesFromBook(): Promise<AddressBook> {
  const db = await ensureDb();
  await db.read();
  return db.data;
}

export async function addAddressToBook(alias: string, address: string) {
  const addressBookEntry = { alias, address };

  const db = await ensureDb();
  await db.update(({ addresses }) => addresses.push(addressBookEntry));
}

export async function removeAddressFromBook(alias: string) {
  const db = await ensureDb();

  // Find the index of the entry with the matching alias
  const index = db.data.addresses.findIndex((entry) => entry.alias === alias);

  if (index === -1) {
    throw new Error(`Alias "${alias}" does not exist in address book.`);
  }

  // Remove the entry from the array
  db.data.addresses.splice(index, 1);

  // Save the updated data back to the database
  await db.write();

  console.log(`Alias "${alias}" has been successfully removed.`);
}
