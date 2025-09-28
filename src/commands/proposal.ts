import { Command, Option } from 'commander';
import { validateAddress, validateUInt } from '../validators.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import {
  ensureMultisigAddressExists,
  ensureNetworkExists,
  ensureProfileExists,
} from '../storage.js';
import { loadProfile } from '../signing.js';
import { initAptos } from '../utils.js';
import { fetchPendingTxns } from '../transactions.js';

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
      '-s, --sequence-number <number>',
      'fetch transaction with specific sequence number',
      validateUInt
    )
    .option('-p, --profile <string>', 'Profile to use for the transaction')
    .option('--json', 'Output in JSON format for scripting')
    .action(
      async (options: {
        multisigAddress: string;
        network?: NetworkChoice;
        profile?: string;
        fullnode?: string;
        sequenceNumber?: number;
        json?: boolean;
      }) => {
        const network = await ensureNetworkExists(options.network, options.profile);
        const profile = await ensureProfileExists(options.profile);
        let fullnode = options.fullnode;

        const profileData = await loadProfile(profile, network, true);
        if (!fullnode) {
          fullnode = profileData.fullnode;
        }

        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        // If JSON output requested, fetch and output proposals as JSON
        if (options.json) {
          const aptos = initAptos(network, fullnode);
          const txns = await fetchPendingTxns(aptos, multisig, options.sequenceNumber);

          // Format proposals for JSON output
          const proposals = txns.map((txn) => ({
            sequenceNumber: txn.sequence_number,
            function: txn.payload_decoded.success
              ? txn.payload_decoded.data.function
              : 'Failed to decode',
            creator: txn.creator,
            creationTime: Number(txn.creation_time_secs),
            votes: {
              yes: txn.yesVotes.map((v) => v.toString()),
              no: txn.noVotes.map((v) => v.toString()),
            },
            simulationStatus: txn.simulationSuccess ? 'OK' : 'NOK',
            simulationVmStatus: txn.simulationVmStatus,
            payload: txn.payload_decoded.success ? txn.payload_decoded.data : null,
          }));

          const output = {
            multisig,
            network,
            proposals,
          };

          console.log(JSON.stringify(output, null, 2));
          return;
        }

        // Otherwise use Ink UI (interactive mode)
        const { runProposalView } = await import('../ui/ProposalView.js');
        return runProposalView({
          multisigAddress: multisig,
          network,
          fullnode,
          profile,
          sequenceNumber: options.sequenceNumber,
        });
      }
    );
};
