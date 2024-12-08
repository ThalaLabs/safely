import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { fetchAliasIfPresent, getAllAddressesFromBook } from '../addressBook.js';
import { numPendingTxns } from '../transactions.js';

export const registerSummaryCommand = (program: Command) => {
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
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));

      // 1. Fetch Signer Info
      const [signers] = await aptos.view<string[][]>({
        payload: {
          function: '0x1::multisig_account::owners',
          functionArguments: [options.multisig],
        },
      });

      const addressBook = await getAllAddressesFromBook();
      const aliasedSigners = signers.map((signer) => {
        return fetchAliasIfPresent(addressBook, signer);
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
      try {
        const txCount = await numPendingTxns(aptos, options.multisig);
        console.log(chalk.blue(`\nNum Pending Txns: ${txCount}`));
      } catch (e) {
        console.error(chalk.red(`No pending transactions found: ${(e as Error).message}`));
      }
    });
};
