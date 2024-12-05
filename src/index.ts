#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';

const program = new Command();

import {
  Aptos,
  AptosConfig,
  Deserializer,
  MultiSigTransactionPayload,
  Network,
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
      const zipped = sequenceNumbers.map((sn, i) => ({
        sequenceNumber: sn,
        ...pending[i],
        payload_decoded: decode(pending[i].payload.vec[0]),
      }));
      console.log(zipped);
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
      console.log(decode(options.bytes));
    } catch (error) {
      console.error(chalk.red(`Error: ${(error as Error).message}`));
    }
  });

program.parse();

function decode(hexStrWithPrefix: string) {
  const hexStrWithoutPrefix = hexStrWithPrefix.slice(2);
  const bytes = new Uint8Array(
    hexStrWithoutPrefix.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const deserializer = new Deserializer(bytes);
  const payload = MultiSigTransactionPayload.deserialize(deserializer);
  const { module_name, function_name, type_args, args } = payload.transaction_payload;
  const functionId = `${module_name.address.toString()}:${module_name.name.identifier}::${function_name.identifier}`;
  const typeArgs = type_args.map((arg) => arg.toString());
  const functionArgs = args.map((arg) => arg.bcsToHex());
  return {
    functionId,
    typeArgs,
    functionArgs,
  };
}
