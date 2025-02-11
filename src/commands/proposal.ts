import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { select } from '@inquirer/prompts';
import { fetchPendingTxns } from '../transactions.js';
import { validateAddress, validateUInt } from '../validators.js';
import { decode } from '../parser.js';
import { AddressBook, ensureMultisigAddressExists, ensureNetworkExists, getDb } from '../storage.js';
import { knownAddresses } from '../labels.js';

export const registerProposalCommand = (program: Command) => {
  program
    .command('proposal')
    .description('List proposals for a multisig')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(
      new Option('--network <network>', 'network to use')
        .choices(['devnet', 'testnet', 'mainnet', 'custom'])
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
        network?: Network;
        fullnode: string;
        filter: 'pending' | 'succeeded' | 'failed';
        sequenceNumber?: number;
        limit?: number;
      }) => {
        const network = await ensureNetworkExists(options.network);

        const aptos = new Aptos(
          new AptosConfig({
            network,
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
            const txChoices = txns.map((txn) => ({
              name: `#${txn.sequence_number} ${chalk.yellow(txn.payload_decoded.function)}`,
              value: txn.sequence_number.toString(),
            }));

            txChoices.push({
              name: 'Exit',
              value: 'quit',
            });

            const selectedSequenceNumber = await select({
              message: `Select a ${options.filter} transaction:`,
              choices: txChoices,
              pageSize: 20,
            });

            if (selectedSequenceNumber === 'quit') {
              break;
            }

            const selectedTxn = txns.find(
              (txn) => txn.sequence_number.toString() === selectedSequenceNumber
            );

            // New action selection loop for the chosen transaction
            while (true) {
              const action = await select({
                message: `Transaction #${selectedSequenceNumber} - Choose action:`,
                choices: [
                  { name: 'View Details', value: 'details' },
                  { name: 'Execute Transaction', value: 'execute' },
                  { name: 'Vote Yes', value: 'vote_yes' },
                  { name: 'Vote No', value: 'vote_no' },
                  { name: 'Back', value: 'back' },
                ],
              });

              switch (action) {
                case 'details':
                  console.log(
                    JSON.stringify(
                      selectedTxn,
                      (key, value) => {
                        if (typeof value === 'bigint') return value.toString();
                        if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
                        return value;
                      },
                      2
                    )
                  );
                  break;

                case 'execute':
                  console.log(chalk.yellow('Execute functionality not implemented yet'));
                  break;
                case 'vote_yes':
                  console.log(chalk.yellow('Vote yes functionality not implemented yet'));
                  break;
                case 'vote_no':
                  console.log(chalk.yellow('Vote no functionality not implemented yet'));
                  break;

                case 'back':
                  break;
              }

              if (action === 'back') {
                break; // Exit action loop, return to transaction list
              }
            }
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};
