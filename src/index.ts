#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { Low } from 'lowdb';
import { JSONFilePreset } from 'lowdb/node';

import {
  Aptos,
  AptosConfig,
  Deserializer,
  MultiSigTransactionPayload,
  Network,
  fetchEntryFunctionAbi,
  SimpleEntryFunctionArgumentTypes,
  U128,
  EntryFunctionArgument,
  TypeTag,
  U8,
  U64,
  U32,
  U16,
  Bool,
  AccountAddress,
  MoveString,
} from '@aptos-labs/ts-sdk';
import { knownAddresses } from './labels.js';
import { getTransactionExplanation } from './templates.js';

interface MultisigTransaction {
  payload: { vec: [string] };
  payload_hash: { vec: [string] };
  votes: { data: [{ key: string; value: boolean }] };
  creator: string;
  creation_time_secs: string;
}

type Address = {
  alias: string;
  address: string;
};

type AddressBook = {
  addresses: Address[];
};

const program = new Command();

const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

program.name('dontrust').description('CLI tool for Aptos multisig management').version('1.0.0');

program
  .command('executed')
  .description('Get successfully executed transactions for a multisig')
  .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
    if (!/^0x[0-9a-f]{64}$/i.test(value)) {
      console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
      process.exit(1);
    }
    return value;
  })
  .option(
    '-l, --limit <number>',
    'number of executed transactions to fetch (default: 10)',
    (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 0) {
        console.error(chalk.red('Sequence number must be a non-negative integer'));
        process.exit(1);
      }
      return num;
    }
  )
  .action(async (options: { multisig: string; limit?: number }) => {
    const n = options.limit || 10;
    console.log(
      chalk.blue(
        `Fetching the most recent ${n} executed transactions for multisig: ${options.multisig}`
      )
    );

    const events = await aptos.getAccountEventsByEventType({
      accountAddress: options.multisig,
      eventType: '0x1::multisig_account::TransactionExecutionSucceededEvent',
      options: {
        limit: n,
        orderBy: [{ sequence_number: 'desc' }],
      },
    });

    const payloadsDecoded = await Promise.all(
      events.map((e) => decode(e.data.transaction_payload))
    );
    for (const [i, event] of events.entries()) {
      const version = event.transaction_version as number;
      const sn = Number(event.data.sequence_number);
      const executor = event.data.executor;
      console.log({
        sequence_number: sn,
        executor,
        payload_decoded: payloadsDecoded[i],
        version,
      });
    }
  });

program
  .command('pending')
  .description('Get pending transaction(s) for a multisig')
  .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
    if (!/^0x[0-9a-f]{64}$/i.test(value)) {
      console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
      process.exit(1);
    }
    return value;
  })
  .option(
    '-s, --sequence_number <number>',
    'fetch transaction with specific sequence number',
    (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 0) {
        console.error(chalk.red('Sequence number must be a non-negative integer'));
        process.exit(1);
      }
      return num;
    }
  )
  .action(async (options: { multisig: string; sequence_number?: number }) => {
    try {
      console.log(chalk.blue(`Fetching pending transactions for multisig: ${options.multisig}`));
      let pendingMove: MultisigTransaction[];
      let sequenceNumbers: number[];

      if (options.sequence_number !== undefined) {
        const [txn] = await aptos.view<[MultisigTransaction]>({
          payload: {
            function: '0x1::multisig_account::get_transaction',
            functionArguments: [options.multisig, options.sequence_number],
          },
        });
        pendingMove = [txn];
        sequenceNumbers = [options.sequence_number];
      } else {
        const ledgerVersion = await aptos
          .getLedgerInfo()
          .then((info) => BigInt(info.ledger_version));
        const lastResolvedSnPromise = aptos.view({
          payload: {
            function: '0x1::multisig_account::last_resolved_sequence_number',
            functionArguments: [options.multisig],
          },
          options: {
            ledgerVersion,
          },
        });
        const nextSnPromise = aptos.view({
          payload: {
            function: '0x1::multisig_account::next_sequence_number',
            functionArguments: [options.multisig],
          },
          options: {
            ledgerVersion,
          },
        });
        const pendingPromise = aptos.view<[MultisigTransaction[]]>({
          payload: {
            function: '0x1::multisig_account::get_pending_transactions',
            functionArguments: [options.multisig],
          },
          options: {
            ledgerVersion,
          },
        });
        const [[lastResolvedSnMove], [nextSnMove], [pending]] = await Promise.all([
          lastResolvedSnPromise,
          nextSnPromise,
          pendingPromise,
        ]);
        const lastResolvedSn = Number(lastResolvedSnMove as string);
        const nextSn = Number(nextSnMove as string);
        sequenceNumbers = Array.from(
          { length: nextSn - lastResolvedSn - 1 },
          (_, i) => lastResolvedSn + (i + 1)
        );
        pendingMove = pending;
      }
      // TODO: handle payload_hash
      const kept = pendingMove.map(({ votes, payload, payload_hash, ...rest }) => rest);
      const payloadsDecoded = await Promise.all(pendingMove.map((p) => decode(p.payload.vec[0])));
      const addressBook = await getAllAddressesFromBook();
      const votesDecoded = pendingMove.map((p) =>
        p.votes.data.map(({ key, value }) => {
          // Find the index of the entry with the matching alias
          const index = addressBook.addresses.findIndex((entry) => entry.address === key);

          // Use alias if it exists in the map, otherwise fallback to the address
          const humanReadable = addressBook.addresses[index]?.alias || key;
          return `${humanReadable} ${value ? '✅' : '❌'}`;
        })
      );
      const txns = sequenceNumbers.map((sn, i) => ({
        sequence_number: sn,
        ...kept[i],
        payload_decoded: payloadsDecoded[i],
        votes: votesDecoded[i],
      }));

      for (const txn of txns) {
        console.log(txn);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

program
  .command('decode')
  .description('Decode multisig transaction bytes')
  .requiredOption(
    '-b, --bytes <bytes>',
    'transaction bytes to decode (hex string starting with 0x)',
    (value) => {
      if (!value.startsWith('0x') || !/^0x[0-9a-fA-F]+$/.test(value)) {
        console.error(chalk.red('Error: bytes must be a hex string starting with 0x'));
        process.exit(1);
      }
      return value;
    }
  )
  .action(async (options: { bytes: string }) => {
    try {
      console.log(chalk.blue(`Decoding multisig payload: ${options.bytes}`));
      console.log(await decode(options.bytes));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

// Parent command: `addresses`
const addressesCommand = program.command('addresses').description('Manage the local address book');

// Subcommand: `addresses add`
addressesCommand
  .command('add')
  .description('Add a new alias and address to the local address book')
  .requiredOption<string>('--alias <alias>', 'Alias for the address', (value) =>
    value.trim().toLowerCase()
  )
  .requiredOption<string>('--address <address>', 'Hexadecimal address (e.g., 0xabc)', (value) => {
    const trimmed = value.trim();

    // Validate address format (must be a hexadecimal string starting with 0x)
    if (!trimmed.startsWith('0x') || !/^0x[0-9a-fA-F]+$/.test(trimmed)) {
      throw new Error('Address must be a valid hex string starting with 0x.');
    }
    return trimmed;
  })
  .action(async (options: { alias: string; address: string }) => {
    try {
      // Add alias and address to the storage
      await addAddressToBook(options.alias, options.address);
      console.log(chalk.green(`Successfully added: ${options.alias} -> ${options.address}`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

// Subcommand: `addresses list`
addressesCommand
  .command('list')
  .description('List all saved aliases and addresses')
  .action(async () => {
    try {
      const addressBook = await getAllAddressesFromBook();

      if (!addressBook.addresses || Object.keys(addressBook).length === 0) {
        console.log(chalk.yellow('No addresses found in the address book.'));
        return;
      }

      console.log(chalk.blue('Address Book:'));

      // Iterate through the addresses and print each alias-address pair
      addressBook.addresses.forEach(({ alias, address }, index) => {
        console.log(chalk.green(`${index + 1}. ${alias}: ${address}`));
      });
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

addressesCommand
  .command('remove')
  .description('Remove an alias from the local address book')
  .requiredOption<string>('--alias <alias>', 'Alias to remove', (value) =>
    value.trim().toLowerCase()
  )
  .action(async (options: { alias: string }) => {
    try {
      // Remove the alias
      await removeAddressFromBook(options.alias);
      console.log(chalk.green(`Successfully removed alias "${options.alias}".`));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

program.parse();

async function decode(hexStrWithPrefix: string): Promise<{
  function_id: string;
  type_args: string[];
  args: SimpleEntryFunctionArgumentTypes[];
  contract?: string;
  explanation: string;
}> {
  const hexStrWithoutPrefix = hexStrWithPrefix.slice(2);
  const bytes = new Uint8Array(
    hexStrWithoutPrefix.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const deserializer = new Deserializer(bytes);
  const payload = MultiSigTransactionPayload.deserialize(deserializer);
  const { module_name, function_name, type_args, args } = payload.transaction_payload;
  const packageAddress = module_name.address.toString();
  const packageName = module_name.name.identifier;
  const functionName = function_name.identifier;
  const functionId = `${packageAddress}::${packageName}::${functionName}`;
  const contract = knownAddresses[packageAddress] || 'unknown';

  const abi = await fetchEntryFunctionAbi(packageAddress, packageName, functionName, config);
  const functionArgs = abi.parameters.map((typeTag, i) => {
    return parseArg(typeTag, args[i]);
  });
  const typeArgs = type_args.map((arg) => arg.toString());
  const explanation = getTransactionExplanation(functionId, typeArgs, functionArgs);

  return {
    function_id: functionId,
    type_args: typeArgs,
    args: functionArgs,
    contract,
    explanation,
  };
}

function parseArg(typeTag: TypeTag, arg: EntryFunctionArgument): SimpleEntryFunctionArgumentTypes {
  const tt = typeTag.toString();
  const deserializer = new Deserializer(arg.bcsToBytes());
  if (tt === 'u8') {
    return U8.deserialize(deserializer).value;
  }
  if (tt === 'u16') {
    return U16.deserialize(deserializer).value;
  }
  if (tt === 'u32') {
    return U32.deserialize(deserializer).value;
  }
  if (tt === 'u64') {
    return U64.deserialize(deserializer).value;
  }
  if (tt === 'u128') {
    return U128.deserialize(deserializer).value;
  }
  if (tt === 'bool') {
    return Bool.deserialize(deserializer).value;
  }
  if (tt === 'address') {
    return AccountAddress.deserialize(deserializer).toString();
  }
  if (tt === '0x1::string::String') {
    return MoveString.deserialize(deserializer).value;
  }
  if (tt.startsWith('0x1::object::Object')) {
    return AccountAddress.deserialize(deserializer).toString();
  }
  // TODO: vector, bytes
  throw new Error(`Unsupported type tag: ${tt}`);
}

async function ensureDb(): Promise<Low<AddressBook>> {
  const defaultData: AddressBook = { addresses: [] };
  return await JSONFilePreset<AddressBook>('addressbook.json', defaultData);
}
async function getAllAddressesFromBook(): Promise<AddressBook> {
  const db = await ensureDb();
  await db.read();
  return db.data;
}

async function addAddressToBook(alias: string, address: string) {
  const addressBookEntry = { alias, address };

  const db = await ensureDb();
  await db.update(({ addresses }) => addresses.push(addressBookEntry));
}

async function removeAddressFromBook(alias: string) {
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
