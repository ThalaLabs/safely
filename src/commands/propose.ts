import { Command, Option } from 'commander';
import { Aptos, AptosConfig, MoveFunctionId } from '@aptos-labs/ts-sdk';
import { parseEntryFunctionPayload, isBatchPayload, parseBatchPayload } from '../entryFunction.js';
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
import { confirm } from '@inquirer/prompts';

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
    .description('Propose a raw transaction from a payload file (supports batch payloads)')
    .requiredOption(
      '--payload <payload>',
      'Transaction payload (JSON/YAML file path, JSON string, or - for stdin)'
    )
    .option('--yes', 'Skip confirmation prompt for batch payloads')
    .addHelpText(
      'after',
      `
Examples:
  # Single payload from JSON file
  $ safely propose raw --payload payload.json
  
  # Single payload from YAML file
  $ safely propose raw --payload payload.yaml
  
  # Direct JSON string
  $ safely propose raw --payload '{"function_id":"0x1::coin::transfer","type_args":["0x1::aptos_coin::AptosCoin"],"args":["0x123",1000]}'
  
  # From stdin
  $ echo '{"function_id":"0x1::coin::transfer","type_args":["0x1::aptos_coin::AptosCoin"],"args":["0x123",1000]}' | safely propose raw --payload -
  
  # Batch payload from file
  $ safely propose raw --payload batch.json
  
  # Batch payload with auto-confirm
  $ safely propose raw --payload batch.json --yes
  
  # Example batch.json:
  [
    {"function_id":"0x1::coin::transfer","type_args":["0x1::aptos_coin::AptosCoin"],"args":["0x123",1000]},
    {"function_id":"0x1::coin::transfer","type_args":["0x1::aptos_coin::AptosCoin"],"args":["0x456",2000]}
  ]`
    )
    .action(async (options: { payload: string; yes?: boolean }, cmd) => {
      const parentOptions = cmd.parent.opts();
      const multisig = await ensureMultisigAddressExists(parentOptions.multisigAddress);
      const profile = await ensureProfileExists(parentOptions.profile);
      const network = await ensureNetworkExists(parentOptions.network);

      try {
        const jsonContent = await resolvePayloadInput(options.payload);
        
        // Check if it's a batch payload
        if (isBatchPayload(jsonContent)) {
          const payloads = parseBatchPayload(jsonContent);
          
          // Show confirmation unless --yes is provided
          if (!options.yes) {
            const shouldContinue = await confirm({
              message: `Found ${payloads.length} transactions to propose. Continue?`,
              default: true,
            });
            
            if (!shouldContinue) {
              console.log('Batch proposal cancelled.');
              return;
            }
          }
          
          const { signer, fullnode } = await loadProfile(profile, network);
          const aptos = new Aptos(new AptosConfig({ fullnode }));
          
          // Process each transaction sequentially
          for (let i = 0; i < payloads.length; i++) {
            console.log(chalk.blue(`\nProposing transaction ${i + 1}/${payloads.length}...`));
            
            try {
              await proposeEntryFunction(
                aptos,
                signer,
                payloads[i],
                multisig,
                network,
                !parentOptions.ignoreSimulate
              );
            } catch (error) {
              console.error(chalk.red(`\nTransaction ${i + 1}/${payloads.length} failed: ${(error as Error).message}`));
              console.error(chalk.red('Stopping batch processing due to failure.'));
              process.exit(1);
            }
          }
          
          console.log(chalk.green(`\nSuccessfully proposed all ${payloads.length} transactions.`));
        } else {
          // Single payload - use existing logic
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
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
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
