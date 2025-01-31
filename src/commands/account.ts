import {
  Aptos,
  AptosConfig,
  Network,
  MoveFunctionId,
  WriteSetChange,
  WriteSetChangeWriteResource,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { AddressBook, ensureMultisigAddressExists, getDb } from '../storage.js';
import { numPendingTxns, proposeEntryFunction } from '../transactions.js';
import { validateAddress, validateAddresses, validateUInt } from '../validators.js';
import { loadProfile, signAndSubmitTransaction } from '../signing.js';

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
      validateUInt
    )
    .requiredOption('-p, --profile <string>', 'Profile to use for the transaction')
    .action(
      async (options: {
        additionalOwners: string[];
        numSignaturesRequired: number;
        profile: string;
      }) => {
        const entryFunction = {
          function: '0x1::multisig_account::create_with_owners' as MoveFunctionId,
          typeArguments: [],
          functionArguments: [options.additionalOwners, options.numSignaturesRequired, [], []],
        };
        try {
          const { network, signer, fullnode } = await loadProfile(options.profile);
          const aptos = new Aptos(new AptosConfig({ network, fullnode }));
          const preparedTxn = await aptos.transaction.build.simple({
            sender: signer.accountAddress,
            data: entryFunction,
          });
          const committedTxn = await signAndSubmitTransaction(aptos, signer, preparedTxn);
          const { success, vm_status, changes } = await aptos.waitForTransaction({
            transactionHash: committedTxn.hash,
          });
          if (success) {
            const isWriteSetChangeWriteResource = (
              change: WriteSetChange
            ): change is WriteSetChangeWriteResource => change.type === 'write_resource';
            const multisigAccountChange = changes
              .filter(isWriteSetChangeWriteResource)
              .find((change) => change.data.type === '0x1::multisig_account::MultisigAccount')!;
            console.log(
              chalk.green(
                `Create multisig ok: https://explorer.aptoslabs.com/account/${multisigAccountChange.address}?network=${aptos.config.network}`
              )
            );
          } else {
            console.log(
              chalk.red(
                `Create multisig nok ${vm_status}: https://explorer.aptoslabs.com/txn/${committedTxn.hash}?network=${aptos.config.network}`
              )
            );
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );

  account
    .command('update')
    .description('Update multisig owners and optionally the number of required signatures')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
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
    .requiredOption(
      '-n, --num-signatures-required <number>',
      'New number of signatures required for execution',
      validateUInt
    )
    .requiredOption('-p, --profile <string>', 'Profile to use for the transaction')
    .action(
      async (options: {
        multisigAddress: string;
        ownersAdd: string[];
        ownersRemove: string[];
        numSignaturesRequired: number;
        profile: string;
      }) => {
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
          const { network, signer, fullnode } = await loadProfile(options.profile);
          const aptos = new Aptos(new AptosConfig({ network, ...(fullnode && { fullnode }) }));
          const multisig = await ensureMultisigAddressExists(options.multisigAddress);

          await proposeEntryFunction(aptos, signer, entryFunction, multisig);
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );

  // List owners
  account
    .command('show')
    .description('Show multisig summary')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(
      new Option('--network <network>', 'network to use')
        .choices(['devnet', 'testnet', 'mainnet', 'custom'])
        .default('mainnet')
    )
    .addOption(new Option('--fullnode <url>', 'Fullnode URL for custom network'))
    .hook('preAction', (thisCommand) => {
      const options = thisCommand.opts();
      if (options.network === 'custom' && !options.fullnode) {
        throw new Error('When using a "custom" network, you must provide a --fullnode URL.');
      }
    })
    .action(async (options: { fullnode: string; multisigAddress: string; network: string }) => {
      const aptos = new Aptos(
        new AptosConfig({
          network: options.network as Network,
          ...(options.fullnode && { fullnode: options.fullnode }),
        })
      );

      try {
        // owners
        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        const [signers] = await aptos.view<string[][]>({
          payload: {
            function: '0x1::multisig_account::owners',
            functionArguments: [multisig],
          },
        });
        const safelyStorage = await getDb();
        const aliasedSigners = signers.map((signer) => {
          const alias = AddressBook.findAliasOrReturnAddress(safelyStorage.data, signer);
          return `${signer} ${alias !== signer ? alias : ''}`.trim();
        });

        const [signaturesRequired] = await aptos.view<string[]>({
          payload: {
            function: '0x1::multisig_account::num_signatures_required',
            functionArguments: [multisig],
          },
        });
        const numSignaturesRequired = Number(signaturesRequired);

        // # pending txns
        const txCount = await numPendingTxns(aptos, multisig);

        console.log(
          JSON.stringify({
            owners: aliasedSigners,
            signaturesRequired: numSignaturesRequired,
            pendingTxns: txCount,
          })
        );
      } catch (e) {
        console.error(chalk.red(`Error: ${(e as Error).message}`));
      }
    });
};
