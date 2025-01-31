import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { select } from '@inquirer/prompts';
import { fetchPendingTxns } from '../transactions.js';
import { validateAddress, validateUInt } from '../validators.js';
import { decode } from '../parser.js';
import { AddressBook, ensureMultisigAddressExists, getDb } from '../storage.js';
import { knownAddresses } from '../labels.js';

export const registerProposalCommand = (program: Command) => {
  program
    .command('proposal')
    .description('List proposals for a multisig')
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
    .option(
      '-f, --filter <status>',
      'filter proposals by status',
      (value) => {
        const validStatuses = ['pending', 'succeeded', 'failed'];
        if (!validStatuses.includes(value)) {
          console.error(chalk.red('Filter must be one of: pending, succeeded, failed'));
          process.exit(1);
        }
        return value;
      },
      'pending'
    )
    .option(
      '-s, --sequence-number <number>',
      'fetch transaction with specific sequence number',
      validateUInt
    )
    .option('-l, --limit <number>', 'number of transactions to fetch (default: 20)', validateUInt)
    .action(
      async (options: {
        multisigAddress: string;
        network: string;
        fullnode: string;
        filter: 'pending' | 'succeeded' | 'failed';
        sequenceNumber?: number;
        limit?: number;
      }) => {
        const aptos = new Aptos(
          new AptosConfig({
            network: options.network as Network,
            ...(options.fullnode && { fullnode: options.fullnode }),
          })
        );
        const n = options.limit || 20;
        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        try {
          // TODO: better type this
          let txns;
          if (options.filter === 'pending') {
            console.log(chalk.blue(`Fetching pending transactions for multisig: ${multisig}`));
            txns = await fetchPendingTxns(aptos, multisig, options.sequenceNumber);
          } else if (options.filter === 'succeeded' || options.filter === 'failed') {
            const eventType =
              options.filter === 'succeeded'
                ? '0x1::multisig_account::TransactionExecutionSucceededEvent'
                : '0x1::multisig_account::TransactionExecutionFailedEvent';

            console.log(
              chalk.blue(
                `Fetching the most recent ${n} ${options.filter} transactions for multisig: ${multisig}`
              )
            );

            const events = await aptos.getAccountEventsByEventType({
              accountAddress: multisig,
              eventType,
              options: {
                limit: n,
                orderBy: [{ sequence_number: 'desc' }],
              },
            });

            const entryFunctions = await Promise.all(
              events.map((event) => decode(aptos, event.data.transaction_payload))
            );

            let safelyStorage = await getDb();
            txns = events.map((event, i) => {
              const version = event.transaction_version as number;
              const sn = Number(event.data.sequence_number);
              const executor = AddressBook.findAliasOrReturnAddress(
                safelyStorage.data,
                event.data.executor
              );
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
          } else {
            throw new Error(`Unsupported filter: ${options.filter}`);
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
