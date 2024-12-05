#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

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
import { knownAddresses } from './label.js';

interface MultisigTransaction {
  payload: { vec: [string] };
  payload_hash: { vec: [string] };
  votes: { data: [{ key: string; value: boolean }] };
  creator: string;
  creation_time_secs: string;
}

const program = new Command();

const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

program.name('dontrust').description('CLI tool for Aptos multisig management').version('1.0.0');

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
      const votesDecoded = pendingMove.map((p) =>
        p.votes.data.map(({ key, value }) => `${key} ${value ? '✅' : '❌'}`)
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

program.parse();

async function decode(hexStrWithPrefix: string): Promise<{
  function_id: string;
  type_args: string[];
  args: SimpleEntryFunctionArgumentTypes[];
  contract?: string;
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
  return {
    function_id: functionId,
    type_args: typeArgs,
    args: functionArgs,
    contract,
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
  if (tt === 'string') {
    return MoveString.deserialize(deserializer).value;
  }
  if (tt.startsWith('0x1::object::Object')) {
    return AccountAddress.deserialize(deserializer).toString();
  }
  // TODO: vector, bytes
  throw new Error(`Unsupported type tag: ${tt}`);
}
