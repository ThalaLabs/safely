import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { fetchAliasIfPresent, getAllAddressesFromBook } from '../addressBook.js';
import { numPendingTxns } from '../transactions.js';
import Table from 'cli-table3';
import { validateMultisigAddress } from '../validators.js';

export const registerSummaryCommand = (program: Command) => {
  program
    .command('summary')
    .description('Get summary of a multisig account')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
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

        // # signatures required
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
