import { Command } from 'commander';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { decode } from '../parser.js';
import { fetchAliasIfPresent, getAllAddressesFromBook } from '../addressBook.js';
import { knownAddresses } from '../labels.js';
import { validateMultisigAddress } from '../validators.js';

export const registerExecutedCommand = (program: Command) => {
  program
    .command('executed')
    .description('List executed transactions for a multisig')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .option(
      '-l, --limit <number>',
      'number of executed transactions to fetch (default: 10)',
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          console.error(chalk.red('Sequence number must be a non-negative integer'));
          process.exit(1);
        }
        return num;
      }
    )
    .action(async (options: { multisigAddress: string; limit?: number }) => {
      const network = program.getOptionValue('network') as Network;
      const aptos = new Aptos(new AptosConfig({ network }));
      const n = options.limit || 10;
      console.log(
        chalk.blue(
          `Fetching the most recent ${n} executed transactions for multisig: ${options.multisigAddress}`
        )
      );

      const events = await aptos.getAccountEventsByEventType({
        accountAddress: options.multisigAddress,
        eventType: '0x1::multisig_account::TransactionExecutionSucceededEvent',
        options: {
          limit: n,
          orderBy: [{ sequence_number: 'desc' }],
        },
      });

      const entryFunctions = await Promise.all(
        events.map((e) => decode(aptos, e.data.transaction_payload))
      );

      const addressBook = await getAllAddressesFromBook();
      for (const [i, event] of events.entries()) {
        const version = event.transaction_version as number;
        const sn = Number(event.data.sequence_number);
        const executor = fetchAliasIfPresent(addressBook, event.data.executor);
        const [packageAddress] = entryFunctions[i].function.split('::');
        const contract = knownAddresses[packageAddress] || 'unknown';

        console.log({
          sequence_number: sn,
          executor,
          payload_decoded: entryFunctions[i],
          contract,
          version,
        });
      }
    });
};
