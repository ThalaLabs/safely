import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { Aptos, AptosConfig, Network, MoveFunctionId } from '@aptos-labs/ts-sdk';
import { decodeEntryFunction } from '../entryFunction.js';
import chalk from 'chalk';
import { proposeEntryFunction } from '../transactions.js';
import {
  validateLedgerIndex,
  validateMultisigAddress,
  validateRequiredOptions,
} from '../validators.js';
import { getSender } from '../signing.js';

export const registerProposeCommand = (program: Command) => {
  const propose = program
    .command('propose')
    .description('Propose a new transaction for a multisig')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    );

  // Raw transaction from file
  propose
    .command('raw')
    .description('Propose a raw transaction from a payload file')
    .requiredOption('-f, --txn-payload-file <file>', 'Path to the transaction payload file')
    .option('-p, --profile <profile>', 'Profile to use for the transaction')
    .option(
      '-l, --ledgerIndex <ledgerIndex>',
      'Ledger index for the transaction',
      validateLedgerIndex
    )
    .hook('preAction', (thisCommand, actionCommand) => {
      const options = actionCommand.opts();
      validateRequiredOptions(options);
    })
    .action(async (options, cmd) => {
      const { multisigAddress } = cmd.parent.opts();
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

        let { signer, address } = await getSender(options);
        console.log(chalk.blue(`Signer address: ${address}`));

        await proposeEntryFunction(
          aptos,
          options,
          signer,
          address,
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
    .option('-p, --profile <profile>', 'Profile to use for the transaction')
    .option(
      '-l, --ledgerIndex <ledgerIndex>',
      'Ledger index for the transaction',
      validateLedgerIndex
    )
    .hook('preAction', (thisCommand, actionCommand) => {
      const options = actionCommand.opts();
      validateRequiredOptions(options);
    })
    .action(async (options, cmd) => {
      const { multisigAddress } = cmd.parent.parent.opts();
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const entryFunction = {
        function: '0x1::aptos_account::transfer_coins' as MoveFunctionId,
        typeArguments: [options.coinType],
        functionArguments: [options.recipient, options.amount],
      };
      try {
        let { signer, address } = await getSender(options);
        console.log(chalk.blue(`Signer address: ${address}`));
        await proposeEntryFunction(aptos, options, signer, address, entryFunction, multisigAddress);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Add other predefined actions here as subcommands
};
