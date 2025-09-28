import { Command, Option } from 'commander';
import { validateAddress, validateUInt } from '../validators.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import {
  ensureMultisigAddressExists,
  ensureNetworkExists,
  ensureProfileExists,
} from '../storage.js';
import { getProfileFullnode } from '../profiles.js';
import { initAptos, safeStringify } from '../utils.js';
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
    .action(
      async (options: {
        multisigAddress: string;
        network?: NetworkChoice;
        profile?: string;
        fullnode?: string;
        sequenceNumber?: number;
      }) => {
        const network = await ensureNetworkExists(options.network, options.profile);
        const profile = await ensureProfileExists(options.profile);
        let fullnode = options.fullnode;

        if (!fullnode) {
          fullnode = getProfileFullnode(profile, network);
        }

        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        // Always output JSON for automation/scripting
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

        // Use safeStringify for proper BigInt and vector<u8> handling
        console.log(safeStringify(proposals, 2));
      }
    );
};
