import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import { fetchPendingTxns } from '../transactions.js';
import { validateMultisigAddress, validateSequenceNumber } from '../validators.js';
import { decode } from '../parser.js';
import { fetchAliasIfPresent, getAllAddressesFromBook } from '../addressBook.js';
import { knownAddresses } from '../labels.js';

export const registerProposalCommand = (program: Command) => {
  program
    .command('proposal')
    .description('List proposals for a multisig')
    .requiredOption(
      '-m, --multisig-address <address>',
      'multisig account address',
      validateMultisigAddress
    )
    .option(
      '-f, --filter <status>',
      'filter proposals by status',
      (value) => {
        const validStatuses = ['pending', 'executed', 'rejected'];
        if (!validStatuses.includes(value)) {
          console.error(chalk.red('Filter must be one of: pending, executed, rejected'));
          process.exit(1);
        }
        return value;
      },
      'pending'
    )
    .option(
      '-s, --sequence-number <number>',
      'fetch transaction with specific sequence number',
      validateSequenceNumber
    )
    .option('-l, --limit <number>', 'number of transactions to fetch (default: 20)', (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 0) {
        console.error(chalk.red('Limit must be a non-negative integer'));
        process.exit(1);
      }
      return num;
    })
    .action(
      async (options: {
        multisigAddress: string;
        filter: 'pending' | 'executed' | 'rejected';
        sequenceNumber?: number;
        limit?: number;
      }) => {
        const network = program.getOptionValue('network') as Network;
        const aptos = new Aptos(new AptosConfig({ network }));
        const n = options.limit || 20;

        try {
          let txns;
          if (options.filter === 'pending') {
            console.log(
              chalk.blue(`Fetching pending transactions for multisig: ${options.multisigAddress}`)
            );
            txns = await fetchPendingTxns(aptos, options.multisigAddress, options.sequenceNumber);
          } else {
            const eventType =
              options.filter === 'executed'
                ? '0x1::multisig_account::TransactionExecutionSucceededEvent'
                : '0x1::multisig_account::ExecuteRejectedTransactionEvent';

            console.log(
              chalk.blue(
                `Fetching the most recent ${n} ${options.filter} transactions for multisig: ${options.multisigAddress}`
              )
            );

            const events = await aptos.getAccountEventsByEventType({
              accountAddress: options.multisigAddress,
              eventType,
              options: {
                limit: n,
                orderBy: [{ sequence_number: 'desc' }],
              },
            });

            const entryFunctions = await Promise.all(
              events.map((e) => decode(aptos, e.data.transaction_payload))
            );

            const addressBook = await getAllAddressesFromBook();
            txns = events.map((event, i) => {
              const version = event.transaction_version as number;
              const sn = Number(event.data.sequence_number);
              const executor = fetchAliasIfPresent(addressBook, event.data.executor);
              const [packageAddress] = entryFunctions[i].function.split('::');
              const contract = knownAddresses[packageAddress] || 'unknown';

              return {
                sequence_number: sn,
                executor,
                payload_decoded: entryFunctions[i],
                contract,
                version,
              };
            });
          }

          while (true) {
            const choices = txns.map((txn) => ({
              name: `#${txn.sequence_number} ${chalk.yellow(txn.payload_decoded.function)}`,
              value: txn.sequence_number.toString(),
            }));

            choices.push({
              name: 'Exit',
              value: 'quit',
            });

            const answer = await select({
              message: `Select a ${options.filter} transaction:`,
              choices,
              pageSize: 20,
            });

            if (answer === 'quit') {
              break;
            }
            console.log(txns.find((txn) => txn.sequence_number.toString() === answer));
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
