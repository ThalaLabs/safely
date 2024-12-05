import { Command } from 'commander';
import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { decode } from '../parser.js';

export function registerExecutedCommand(program: Command, aptos: Aptos) {
  program
    .command('executed')
    .description('Get successfully executed transactions for a multisig')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
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
    .action(async (options: { multisig: string; limit?: number }) => {
      const n = options.limit || 10;
      console.log(
        chalk.blue(
          `Fetching the most recent ${n} executed transactions for multisig: ${options.multisig}`
        )
      );

      const events = await aptos.getAccountEventsByEventType({
        accountAddress: options.multisig,
        eventType: '0x1::multisig_account::TransactionExecutionSucceededEvent',
        options: {
          limit: n,
          orderBy: [{ sequence_number: 'desc' }],
        },
      });

      const payloadsDecoded = await Promise.all(
        events.map((e) => decode(aptos, e.data.transaction_payload))
      );
      for (const [i, event] of events.entries()) {
        const version = event.transaction_version as number;
        const sn = Number(event.data.sequence_number);
        const executor = event.data.executor;
        console.log({
          sequence_number: sn,
          executor,
          payload_decoded: payloadsDecoded[i],
          version,
        });
      }
    });
}