import chalk from 'chalk';
import { Command, Option } from 'commander';
import { validateAddress, validateUInt, validateBool } from '../validators.js';
import { loadProfile, signAndSubmitTransaction } from '../signing.js';
import {
  ensureMultisigAddressExists,
  ensureProfileExists,
  ensureNetworkExists,
} from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getExplorerUrl, initAptos } from '../utils.js';

export const registerVoteCommand = (program: Command) => {
  program
    .command('vote')
    .description('Vote on a pending transaction')
    .requiredOption(
      '-s, --sequence-number <number>',
      'sequence number of transaction to vote on',
      validateUInt
    )
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', validateBool)
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .option('-p, --profile <string>', 'profile name of voter')
    .action(
      async (options: {
        sequenceNumber: number;
        approve: boolean;
        multisigAddress?: string;
        network?: NetworkChoice;
        profile?: string;
      }) => {
        await handleVoteCommand(
          options.sequenceNumber,
          options.approve,
          await ensureMultisigAddressExists(options.multisigAddress),
          await ensureNetworkExists(options.network),
          await ensureProfileExists(options.profile)
        );
      }
    );
};

export async function handleVoteCommand(
  sequenceNumber: number,
  approve: boolean,
  multisig: string,
  network: NetworkChoice,
  profile: string
) {
  try {
    const { signer, fullnode } = await loadProfile(profile, network);
    const aptos = initAptos(network, fullnode);

    const txn = await aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `0x1::multisig_account::vote_transaction`,
        functionArguments: [multisig, sequenceNumber, approve],
      },
    });

    // Handle signing and submission
    const pendingTxn = await signAndSubmitTransaction(aptos, signer, txn);
    const { success, vm_status } = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    if (success) {
      console.log(chalk.green(`Vote ok: ${getExplorerUrl(network, `txn/${pendingTxn.hash}`)}`));
    } else {
      console.log(
        chalk.red(`Vote nok ${vm_status}: ${getExplorerUrl(network, `txn/${pendingTxn.hash}`)}`)
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
  }
}
