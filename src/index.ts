#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

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

const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

program.name('dontrust').description('CLI tool for Aptos multisig management').version('1.0.0');

program
  .command('pending')
  .description('List pending transactions for a multisig')
  .requiredOption('-m, --multisig <address>', 'multisig contract address')
  .action(async (options) => {
    try {
      console.log(chalk.blue(`Fetching pending transactions for multisig: ${options.multisig}`));
      const ledgerVersion = await aptos.getLedgerInfo().then((info) => BigInt(info.ledger_version));
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
      const pendingPromise = aptos.view({
        payload: {
          function: '0x1::multisig_account::get_pending_transactions',
          functionArguments: [options.multisig],
        },
        options: {
          ledgerVersion,
        },
      });
      const [[lastResolvedSnMove], [nextSnMove], [pendingMove]] = await Promise.all([
        lastResolvedSnPromise,
        nextSnPromise,
        pendingPromise,
      ]);
      const lastResolvedSn = Number(lastResolvedSnMove as string);
      const nextSn = Number(nextSnMove as string);
      const sequenceNumbers = Array.from(
        { length: nextSn - lastResolvedSn - 1 },
        (_, i) => lastResolvedSn + (i + 1)
      );
      const pending = pendingMove as any[];
      const payloads = await Promise.all(pending.map((p) => decode(p.payload.vec[0])));
      const txns = sequenceNumbers.map((sn, i) => ({
        sequence_number: sn,
        ...pending[i],
        payload_decoded: payloads[i],
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
  .requiredOption('-b, --bytes <bytes>', 'transaction bytes to decode')
  .action(async (options) => {
    try {
      console.log(chalk.blue(`Decoding multisig payload: ${options.bytes}`));
      console.log(await decode(options.bytes));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

program.parse();

async function decode(hexStrWithPrefix: string) {
  const hexStrWithoutPrefix = hexStrWithPrefix.slice(2);
  const bytes = new Uint8Array(
    hexStrWithoutPrefix.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const deserializer = new Deserializer(bytes);
  const payload = MultiSigTransactionPayload.deserialize(deserializer);
  const { module_name, function_name, type_args, args } = payload.transaction_payload;
  const functionId = `${module_name.address.toString()}::${module_name.name.identifier}::${function_name.identifier}`;

  const abi = await fetchEntryFunctionAbi(
    module_name.address.toString(),
    module_name.name.identifier,
    function_name.identifier,
    config
  );
  const functionArgs = abi.parameters.map((typeTag, i) => {
    return parseArg(typeTag, args[i]);
  });
  const typeArgs = type_args.map((arg) => arg.toString());
  return {
    functionId,
    typeArgs,
    functionArgs,
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
