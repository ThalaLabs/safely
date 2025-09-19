import { Command, Option } from 'commander';
import { validateAddress, validateUInt } from '../validators.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import {
  ensureMultisigAddressExists,
  ensureNetworkExists,
  ensureProfileExists,
} from '../storage.js';
import { loadProfile } from '../signing.js';

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

        const profileData = await loadProfile(profile, network, true);
        if (!fullnode) {
          fullnode = profileData.fullnode;
        }

        const multisig = await ensureMultisigAddressExists(options.multisigAddress);

        // Use Ink UI as default
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
