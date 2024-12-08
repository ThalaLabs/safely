import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { fetchAliasIfPresent, getAllAddressesFromBook } from '../addressBook.js';
import { numPendingTxns } from '../transactions.js';
import Table from 'cli-table3';

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

      try {
        const table = new Table();

        // owners
        const [signers] = await aptos.view<string[][]>({
          payload: {
            function: '0x1::multisig_account::owners',
            functionArguments: [options.multisig],
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

        // # signatures required
        const [signaturesRequired] = await aptos.view<string[]>({
          payload: {
            function: '0x1::multisig_account::num_signatures_required',
            functionArguments: [options.multisig],
          },
        });
        const numSignaturesRequired = Number(signaturesRequired);
        table.push({
          'Signatures Required': numSignaturesRequired,
        });

        // # pending txns
        const txCount = await numPendingTxns(aptos, options.multisig);
        table.push({
          'Pending Txns': txCount,
        });

        console.log(table.toString());
      } catch (e) {
        console.error(chalk.red(`Error: ${(e as Error).message}`));
      }
    });
};
