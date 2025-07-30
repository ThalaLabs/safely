import { Command, Option } from 'commander';
import { Aptos, AptosConfig, MoveFunctionId } from '@aptos-labs/ts-sdk';
import { parseEntryFunctionPayload } from '../entryFunction.js';
import { resolvePayloadInput } from '../utils.js';
import chalk from 'chalk';
import { proposeEntryFunction } from '../transactions.js';
import { validateAddress, validateAsset } from '../validators.js';
import { loadProfile } from '../signing.js';
import {
  ensureMultisigAddressExists,
  ensureProfileExists,
  ensureNetworkExists,
} from '../storage.js';
import { NETWORK_CHOICES } from '../constants.js';

export const registerProposeCommand = (program: Command) => {
  const propose = program
    .command('propose')
    .description('Propose a new transaction for a multisig')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .option('-p, --profile <string>', 'Profile to use for the transaction')
    .option('--ignore-simulate <boolean>', 'ignore tx simulation', false);

  // Raw transaction from file
  propose
    .command('raw')
    .description('Propose a raw transaction from a payload file')
    .requiredOption(
      '--payload <payload>',
      'Transaction payload (file path, JSON string, or - for stdin)'
    )
    .action(async (options: { payload: string }, cmd) => {
      const parentOptions = cmd.parent.opts();
      const multisig = await ensureMultisigAddressExists(parentOptions.multisigAddress);
      const profile = await ensureProfileExists(parentOptions.profile);
      const network = await ensureNetworkExists(parentOptions.network);

      try {
        const jsonContent = await resolvePayloadInput(options.payload);
        const entryFunction = parseEntryFunctionPayload(jsonContent);

        const { signer, fullnode } = await loadProfile(profile, network);
        const aptos = new Aptos(new AptosConfig({ fullnode }));
        await proposeEntryFunction(
          aptos,
          signer,
          entryFunction,
          multisig,
          network,
          !parentOptions.ignoreSimulate
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
    .command('transfer-assets')
    .description('Transfer assets to an address')
    .requiredOption('--asset <type>', 'Either coin type of fungible asset address', validateAsset)
    .requiredOption('--recipient <address>', 'Recipient address')
    .requiredOption('--amount <number>', 'Amount to transfer', Number)
    .action(
      async (
        options: {
          asset: { type: 'coin' | 'fa'; address: string };
          recipient: string;
          amount: number;
        },
        cmd
      ) => {
        const parentOptions = cmd.parent.parent.opts();
        const multisig = await ensureMultisigAddressExists(parentOptions.multisigAddress);
        const profile = await ensureProfileExists(parentOptions.profile);

        const entryFunction =
          options.asset.type === 'coin'
            ? {
                function: '0x1::aptos_account::transfer_coins' as MoveFunctionId,
                typeArguments: [options.asset.address],
                functionArguments: [options.recipient, options.amount],
              }
            : {
                function: '0x1::primary_fungible_store::transfer' as MoveFunctionId,
                typeArguments: ['0x1::fungible_asset::Metadata'],
                functionArguments: [options.asset.address, options.recipient, options.amount],
              };
        try {
          const network = await ensureNetworkExists(parentOptions.network);
          const { signer, fullnode } = await loadProfile(profile, network);
          const aptos = new Aptos(new AptosConfig({ fullnode }));
          await proposeEntryFunction(
            aptos,
            signer,
            entryFunction,
            multisig,
            network,
            !parentOptions.ignoreSimulate
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );

  // Add other predefined actions here as subcommands
};
