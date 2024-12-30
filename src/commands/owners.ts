import { Aptos, AptosConfig, Network, MoveFunctionId } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { getAllAddressesFromBook, fetchAliasIfPresent } from '../addressBook.js';
import { proposeEntryFunction } from '../transactions.js';
import {
  validateLedgerIndex,
  validateMultisigAddress,
  validateMultisigAddresses,
  validateRequiredOptions,
} from '../validators.js';
import Table from 'cli-table3';
import { getSender } from '../signing.js';

export const registerOwnersCommand = (program: Command) => {
  const propose = program
    .command('owners')
    .description('Multisig owner operations')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    );

  // List owners
  propose
    .command('list')
    .description('List multisig owners')
    .action(async () => {
      const { multisigAddress } = propose.opts();
      console.log(multisigAddress);

      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      try {
        const table = new Table();

        // owners
        const [signers] = await aptos.view<string[][]>({
          payload: {
            function: '0x1::multisig_account::owners',
            functionArguments: [multisigAddress],
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

        console.log(table.toString());
      } catch (e) {
        console.error(chalk.red(`Error: ${(e as Error).message}`));
      }
    });

  // Add owners action
  propose
    .command('add')
    .description('Add owners to multisig')
    .requiredOption(
      '--owners <addresses>',
      'Comma-separated list of owner addresses',
      validateMultisigAddresses
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
    .action(async (options) => {
      const { multisigAddress } = propose.opts();
      console.log(multisigAddress);
      console.log(options.profile);

      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const entryFunction = {
        function: '0x1::multisig_account::add_owners' as MoveFunctionId,
        typeArguments: [],
        functionArguments: [options.owners],
      };
      try {
        let { signer, address } = await getSender(options);
        console.log(chalk.blue(`Signer address: ${address}`));
        await proposeEntryFunction(aptos, options, signer, address, entryFunction, multisigAddress);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Remove owners action
  propose
    .command('remove')
    .description('Remove owners from multisig')
    .requiredOption(
      '--owners <addresses>',
      'Comma-separated list of owner addresses',
      validateMultisigAddresses
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
    .action(async (options) => {
      const { multisigAddress } = propose.opts();
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const entryFunction = {
        function: '0x1::multisig_account::remove_owners' as MoveFunctionId,
        typeArguments: [],
        functionArguments: [options.owners],
      };
      try {
        let { signer, address } = await getSender(options);
        console.log(chalk.blue(`Signer address: ${address}`));
        await proposeEntryFunction(aptos, options, signer, address, entryFunction, multisigAddress);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });

  // Swap owners action
  propose
    .command('swap')
    .description('Swap owners of multisig')
    .requiredOption(
      '--owners-in <addresses>',
      'Comma-separated list of owner addresses to add',
      validateMultisigAddresses
    )
    .requiredOption(
      '--owners-out <addresses>',
      'Comma-separated list of owner addresses to remove',
      validateMultisigAddresses
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
    .action(async (options) => {
      const { multisigAddress } = propose.opts();
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const entryFunction = {
        function: '0x1::multisig_account::swap_owners' as MoveFunctionId,
        typeArguments: [],
        functionArguments: [options.ownersIn, options.ownersOut],
      };
      try {
        let { signer, address } = await getSender(options);
        console.log(chalk.blue(`Signer address: ${address}`));
        await proposeEntryFunction(aptos, options, signer, address, entryFunction, multisigAddress);
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
};
