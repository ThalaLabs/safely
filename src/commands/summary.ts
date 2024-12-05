import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { getAllAddressesFromBook } from '../addressBook.js';
import { fetchPendingTxns } from '../transactions.js'

export const registerSummaryCommand = (program: Command, aptos: Aptos) => {
  program
    .command('summary')
    .description('Get summary information for a multisig')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
    .action(async (options: { multisig: string }) => {

      // 1. Fetch Signer Info
      const [signers] = await aptos.view<string[][]>({
        payload: {
          function: '0x1::multisig_account::owners',
          functionArguments: [options.multisig],
        },
      });

      const addressBook = await getAllAddressesFromBook();
      const aliasedSigners = signers.map((signer) => {
        // Find the index of the entry with the matching alias
        const index = addressBook.addresses.findIndex((entry) => entry.address === signer);

        // Use alias if it exists in the map, otherwise fallback to the address
        return addressBook.addresses[index]?.alias || signer;
      });

      console.log(chalk.blue('Multisig Signers:'));

      // Iterate through the addresses and print each alias-address pair
      aliasedSigners.forEach((signer, index) => {
        console.log(chalk.green(`${index + 1}. ${signer}`));
      });

      // 2. Fetch Signing Threshold
      const [signaturesRequired] = await aptos.view<string[]>({
        payload: {
          function: '0x1::multisig_account::num_signatures_required',
          functionArguments: [options.multisig],
        },
      });

      const numSignaturesRequired = Number(signaturesRequired);

      console.log('\n');

      console.log(chalk.blue(`Signatures Required: ${numSignaturesRequired}`));

      // 3. Fetch Pending SN Txns
      console.log('\n');

      console.log(chalk.blue('Pending Txns:'));
      try {
        fetchPendingTxns(aptos, options.multisig, undefined)
      } catch (e) {
        console.error(chalk.red(`No pending transactions found: ${(e as Error).message}`));
      }
    });
};