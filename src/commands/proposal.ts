import { Aptos } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import readline from 'readline';
import {
  fetchPendingTxnsSafely,
  canUserVote,
  canUserExecute,
  canUserReject,
} from '../transactions.js';
import { validateAddress, validateUInt } from '../validators.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { initAptos, getExplorerUrl } from '../utils.js';
import {
  ensureMultisigAddressExists,
  ensureNetworkExists,
  ensureProfileExists,
  getDb,
} from '../storage.js';
import { handleExecuteCommand } from './execute.js';
import { handleVoteCommand } from './vote.js';
import { loadProfile } from '../signing.js';
import { ProposalTableRenderer } from '../ui/proposalTable.js';
import { ProposalDetailsFormatter } from '../ui/proposalDetails.js';

export const registerProposalCommand = (program: Command) => {
  program
    .command('proposal')
    .description('List proposals for a multisig')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
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
    .option('-p, --profile <string>', 'Profile to use for the transaction')
    .option('-l, --limit <number>', 'number of transactions to fetch (default: 20)', validateUInt)
    .action(
      async (options: {
        multisigAddress: string;
        network?: NetworkChoice;
        profile?: string;
        fullnode?: string;
        filter: 'pending' | 'succeeded' | 'failed';
        sequenceNumber?: number;
        limit?: number;
      }) => {
        const network = await ensureNetworkExists(options.network);
        const profile = await ensureProfileExists(options.profile);
        let fullnode = options.fullnode;

        const profileData = await loadProfile(profile, network, true);
        const { signer } = profileData;
        if (!fullnode) {
          fullnode = profileData.fullnode;
        }

        const aptos = initAptos(network, fullnode);
        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        try {
          // Get multisig owners and signature requirements
          const [[owners], [signaturesRequired]] = await Promise.all([
            aptos.view<string[][]>({
              payload: {
                function: '0x1::multisig_account::owners',
                functionArguments: [multisig],
              },
            }),
            aptos.view<string[]>({
              payload: {
                function: '0x1::multisig_account::num_signatures_required',
                functionArguments: [multisig],
              },
            }),
          ]);

          // Fetch pending transactions
          console.log(chalk.blue(`Fetching pending transactions for multisig: ${multisig}`));
          const txns = await fetchPendingTxnsSafely(aptos, multisig, options.sequenceNumber);

          if (txns.length === 0) {
            console.log(chalk.yellow('No pending transactions found.'));
            return;
          }

          // Create table renderer
          const safelyStorage = await getDb();
          const tableRenderer = new ProposalTableRenderer(
            txns,
            owners,
            Number(signaturesRequired),
            signer.accountAddress.toString()
          );

          const detailsFormatter = new ProposalDetailsFormatter(aptos, owners, safelyStorage);

          // Setup keyboard input
          readline.emitKeypressEvents(process.stdin);
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
          }

          let shouldRefresh = false;
          let actionMessage = '';
          let tableRendered = false;

          const renderFullTable = async () => {
            console.clear();
            console.log(await tableRenderer.render(multisig, detailsFormatter));
            console.log(tableRenderer.renderSelectionStatus());
            if (actionMessage) {
              console.log('\n' + actionMessage);
              console.log(chalk.gray('[Press any key to continue]'));
            }
            tableRendered = true;
          };

          const updateSelectionOnly = () => {
            if (!tableRendered) return;
            // Move cursor to status line area (2 lines up from bottom)
            process.stdout.write('\x1b[3A'); // Move up 3 lines
            process.stdout.write('\x1b[0J'); // Clear from cursor to end of screen
            console.log(tableRenderer.renderSelectionStatus());
          };

          await renderFullTable();

          // Handle keyboard input
          process.stdin.on('keypress', async (str, key) => {
            // Clear action message on any key press if it's showing
            if (actionMessage) {
              actionMessage = '';
              await renderFullTable();
              return;
            }

            if (key.name === 'q') {
              if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
              }
              process.exit(0);
            } else if (key.name === 'up') {
              tableRenderer.moveUp();
              updateSelectionOnly(); // Just update the status line
            } else if (key.name === 'down') {
              tableRenderer.moveDown();
              updateSelectionOnly(); // Just update the status line
            } else if (key.name === 'return' || str === 'f' || str === 'F') {
              tableRenderer.toggleExpanded();
              await renderFullTable(); // Full render needed for expand/collapse
            } else if (str === 'r' || str === 'R') {
              shouldRefresh = true;
            } else if (str === 'y' || str === 'Y' || str === 'n' || str === 'N') {
              const selected = tableRenderer.getSelectedProposal();
              if (selected) {
                try {
                  const voteYes = str === 'y' || str === 'Y';
                  await handleVoteCommand(
                    selected.sequenceNumber,
                    voteYes,
                    multisig,
                    network,
                    profile
                  );
                  actionMessage = chalk.green(
                    `✅ Vote submitted: ${getExplorerUrl(network, 'txn/[hash]')}`
                  );
                  shouldRefresh = true;
                } catch (error) {
                  actionMessage = chalk.red(`❌ Vote failed: ${(error as Error).message}`);
                }
                await renderFullTable();
              }
            } else if (str === 'e' || str === 'E') {
              const selected = tableRenderer.getSelectedProposal();
              if (selected) {
                try {
                  await handleExecuteCommand(multisig, profile, network);
                  actionMessage = chalk.green(
                    `✅ Execute successful: ${getExplorerUrl(network, 'txn/[hash]')}`
                  );
                  shouldRefresh = true;
                } catch (error) {
                  actionMessage = chalk.red(`❌ Execute failed: ${(error as Error).message}`);
                }
                await renderFullTable();
              }
            }

            // Refresh data if needed
            if (shouldRefresh) {
              const newTxns = await fetchPendingTxnsSafely(aptos, multisig, options.sequenceNumber);
              tableRenderer.updateTransactions(newTxns);
              shouldRefresh = false;
              await renderFullTable();
            }
          });
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
          if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
          }
        }
      }
    );
};
