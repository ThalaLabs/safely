import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { decode } from '../parser.js';
import { getAllAddressesFromBook } from '../addressBook.js';

interface MultisigTransaction {
  payload: { vec: [string] };
  payload_hash: { vec: [string] };
  votes: { data: [{ key: string; value: boolean }] };
  creator: string;
  creation_time_secs: string;
}

export const registerPendingCommand = (program: Command, aptos: Aptos) => {
  program
    .command('pending')
    .description('Get pending transaction(s) for a multisig')
    .requiredOption('-m, --multisig <address>', 'multisig contract address', (value) => {
      if (!/^0x[0-9a-f]{64}$/i.test(value)) {
        console.error(chalk.red('Multisig address must be 0x followed by 64 hex characters'));
        process.exit(1);
      }
      return value;
    })
    .option(
      '-s, --sequence_number <number>',
      'fetch transaction with specific sequence number',
      (value) => {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          console.error(chalk.red('Sequence number must be a non-negative integer'));
          process.exit(1);
        }
        return num;
      }
    )
    .action(async (options: { multisig: string; sequence_number?: number }) => {
      try {
        console.log(chalk.blue(`Fetching pending transactions for multisig: ${options.multisig}`));
        let pendingMove: MultisigTransaction[];
        let sequenceNumbers: number[];

        if (options.sequence_number !== undefined) {
          const [txn] = await aptos.view<[MultisigTransaction]>({
            payload: {
              function: '0x1::multisig_account::get_transaction',
              functionArguments: [options.multisig, options.sequence_number],
            },
          });
          pendingMove = [txn];
          sequenceNumbers = [options.sequence_number];
        } else {
          const ledgerVersion = await aptos
            .getLedgerInfo()
            .then((info) => BigInt(info.ledger_version));
          const lastResolvedSnPromise = aptos.view({
            payload: {
              function: '0x1::multisig_account::last_resolved_sequence_number',
              functionArguments: [options.multisig],
            },
            options: {
              ledgerVersion,
            },
          });
          const nextSnPromise = aptos.view({
            payload: {
              function: '0x1::multisig_account::next_sequence_number',
              functionArguments: [options.multisig],
            },
            options: {
              ledgerVersion,
            },
          });
          const pendingPromise = aptos.view<[MultisigTransaction[]]>({
            payload: {
              function: '0x1::multisig_account::get_pending_transactions',
              functionArguments: [options.multisig],
            },
            options: {
              ledgerVersion,
            },
          });
          const [[lastResolvedSnMove], [nextSnMove], [pending]] = await Promise.all([
            lastResolvedSnPromise,
            nextSnPromise,
            pendingPromise,
          ]);
          const lastResolvedSn = Number(lastResolvedSnMove as string);
          const nextSn = Number(nextSnMove as string);
          sequenceNumbers = Array.from(
            { length: nextSn - lastResolvedSn - 1 },
            (_, i) => lastResolvedSn + (i + 1)
          );
          pendingMove = pending;
        }
        // TODO: handle payload_hash
        const kept = pendingMove.map(({ votes, payload, payload_hash, ...rest }) => rest);
        const payloadsDecoded = await Promise.all(
          pendingMove.map((p) => decode(aptos, p.payload.vec[0]))
        );
        const addressBook = await getAllAddressesFromBook();
        const votesDecoded = pendingMove.map((p) =>
          p.votes.data.map(({ key, value }) => {
            // Find the index of the entry with the matching alias
            const index = addressBook.addresses.findIndex((entry) => entry.address === key);

            // Use alias if it exists in the map, otherwise fallback to the address
            const humanReadable = addressBook.addresses[index]?.alias || key;
            return `${humanReadable} ${value ? '✅' : '❌'}`;
          })
        );
        const txns = sequenceNumbers.map((sn, i) => ({
          sequence_number: sn,
          ...kept[i],
          payload_decoded: payloadsDecoded[i],
          votes: votesDecoded[i],
        }));

        for (const txn of txns) {
          console.log(txn);
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
      }
    });
};
