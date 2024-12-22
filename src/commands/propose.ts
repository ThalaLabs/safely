import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { Aptos, AptosConfig, Network, MoveFunctionId } from '@aptos-labs/ts-sdk';
import { decodeEntryFunction } from '../entryFunction.js';
import { loadAccount } from '../accounts.js';
import chalk from 'chalk';
import { proposeEntryFunction } from '../transactions.js';
import { validateMultisigAddress } from '../validators.js';

export const registerProposeCommand = (program: Command) => {
  const propose = program
    .command('propose')
    .description('Propose a new transaction for a multisig')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .requiredOption('-p, --profile <profile>', 'Profile to use for the transaction');

  // Raw transaction from file
  propose
    .command('raw')
    .description('Propose a raw transaction from a payload file')
    .requiredOption('-f, --txn-payload-file <file>', 'Path to the transaction payload file')
    .action(async (options, cmd) => {
      const { multisigAddress, profile } = cmd.parent.opts();
      const { txnPayloadFile } = options;
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        if (!txnPayloadFile) {
          throw new Error('Must specify --txn-payload-file');
        }
        const fullPath = path.resolve(txnPayloadFile);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Transaction payload file not found: ${fullPath}`);
        }
        await proposeEntryFunction(
          aptos,
          loadAccount(profile),
          decodeEntryFunction(fullPath),
          multisigAddress
        );
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Predefined actions
  const predefined = propose
    .command('predefined')
    .description('Propose a predefined transaction type');

  // Transfer coins action
  predefined
    .command('transfer-coins')
    .description('Transfer coins to an address')
    .requiredOption('--coin-type <type>', 'Coin type')
    .requiredOption('--recipient <address>', 'Recipient address')
    .requiredOption('--amount <number>', 'Amount to transfer', Number)
    .action(async (options, cmd) => {
      const { multisigAddress, profile } = cmd.parent.parent.opts();
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const entryFunction = {
        function: '0x1::aptos_account::transfer_coins' as MoveFunctionId,
        typeArguments: [options.coinType],
        functionArguments: [options.recipient, options.amount],
      };
      try {
        await proposeEntryFunction(aptos, loadAccount(profile), entryFunction, multisigAddress);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Add other predefined actions here as subcommands
};
