import {
  Aptos,
  AptosConfig,
  Network,
  MoveFunctionId,
  WriteSetChange,
  WriteSetChangeWriteResource,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { getAllAddressesFromBook, fetchAliasIfPresent } from '../addressBook.js';
import { numPendingTxns, proposeEntryFunction } from '../transactions.js';
import {
  validateLedgerIndex,
  validateAddress,
  validateAddresses,
  validateRequiredOptions,
} from '../validators.js';
import Table from 'cli-table3';
import { getSender, signAndSubmitProfile } from '../signing.js';
import { loadAccount } from '../accounts.js';

export const registerAccountCommand = (program: Command) => {
  const account = program.command('account').description('Multisig account operations');

  account
    .command('create')
    .description('Create a new multisig account')
    .requiredOption(
      '-o, --additional-owners <addresses>',
      'Comma-separated list of additional owner addresses',
      validateAddresses
    )
    .requiredOption(
      '-n, --num-signatures-required <number>',
      'Number of signatures required for execution',
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          throw new Error('Number of signatures required must be a positive integer');
        }
        return num;
      }
    )
    .requiredOption('-p, --profile <profile>', 'Profile to use for the transaction')
    .action(
      async (options: {
        additionalOwners: string[];
        numSignaturesRequired: number;
        profile: string;
      }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));
        const entryFunction = {
          function: '0x1::multisig_account::create_with_owners' as MoveFunctionId,
          typeArguments: [],
          functionArguments: [options.additionalOwners, options.numSignaturesRequired, [], []],
        };
        try {
          const signer = loadAccount(options.profile);
          const preparedTxn = await aptos.transaction.build.simple({
            sender: signer.accountAddress,
            data: entryFunction,
          });
          const committedTxn = await signAndSubmitProfile(aptos, signer, preparedTxn);
          const { changes } = await aptos.waitForTransaction({
            transactionHash: committedTxn.hash,
          });
          const isWriteSetChangeWriteResource = (
            change: WriteSetChange
          ): change is WriteSetChangeWriteResource => change.type === 'write_resource';
          const multisigAccountChange = changes
            .filter(isWriteSetChangeWriteResource)
            .find((change) => change.data.type === '0x1::multisig_account::MultisigAccount')!;
          console.log(
            chalk.green(
              `Multisig created successfully: https://explorer.aptoslabs.com/account/${multisigAccountChange.address}?network=${aptos.config.network}`
            )
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );

  account
    .command('update')
    .description('Update multisig owners and optionally the number of required signatures')
    .requiredOption('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .requiredOption(
      '-a, --owners-add <addresses>',
      'Comma-separated list of owner addresses to add',
      validateAddresses
    )
    .requiredOption(
      '-r, --owners-remove <addresses>',
      'Comma-separated list of owner addresses to remove',
      validateAddresses
    )
    .option(
      '-n, --num-signatures-required <number>',
      'New number of signatures required for execution',
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num <= 0) {
          throw new Error('Number of signatures required must be a positive integer');
        }
        return num;
      }
    )
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
    .action(
      async (options: {
        multisigAddress: string;
        ownersAdd: string[];
        ownersRemove: string[];
        numSignaturesRequired: number;
        profile: string;
        ledgerIndex: number;
      }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));
        const entryFunction = {
          function:
            '0x1::multisig_account::swap_owners_and_update_signatures_required' as MoveFunctionId,
          typeArguments: [],
          functionArguments: [
            options.ownersAdd,
            options.ownersRemove,
            options.numSignaturesRequired,
          ],
        };
        try {
          const { signer, address } = await getSender(options);
          console.log(chalk.blue(`Signer address: ${address}`));
          await proposeEntryFunction(
            aptos,
            options,
            signer,
            address,
            entryFunction,
            options.multisigAddress
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );

  // List owners
  account
    .command('show')
    .description('Show multisig summary')
    .requiredOption('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .action(async (options: { multisigAddress: string }) => {
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        const table = new Table();

        // owners
        const [signers] = await aptos.view<string[][]>({
          payload: {
            function: '0x1::multisig_account::owners',
            functionArguments: [options.multisigAddress],
          },
        });
        const addressBook = await getAllAddressesFromBook();
        const aliasedSigners = signers.map((signer) => {
          const alias = fetchAliasIfPresent(addressBook, signer);
          return `${signer} ${alias !== signer ? alias : ''}`.trim();
        });
        table.push({
          Signers: aliasedSigners.join('\n'),
        });

        const [signaturesRequired] = await aptos.view<string[]>({
          payload: {
            function: '0x1::multisig_account::num_signatures_required',
            functionArguments: [options.multisigAddress],
          },
        });
        const numSignaturesRequired = Number(signaturesRequired);
        table.push({
          'Signatures Required': numSignaturesRequired,
        });

        // # pending txns
        const txCount = await numPendingTxns(aptos, options.multisigAddress);
        table.push({
          'Pending Txns': txCount,
        });

        console.log(table.toString());
      } catch (e) {
        console.error(chalk.red(`Error: ${(e as Error).message}`));
      }
    });
};
