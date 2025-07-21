import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command, Option } from 'commander';
import { validateAddress, validateUInt, validateBool } from '../validators.js';
import { loadProfile, signAndSubmitTransaction } from '../signing.js';
import { ensureMultisigAddressExists, ensureProfileExists, ensureNetworkExists } from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getExplorerUrl } from '../utils.js';

export const registerVoteCommand = (program: Command) => {
  program
    .command('vote')
    .description('Vote on a pending transaction')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .requiredOption(
      '-s, --sequence-number <number>',
      'sequence number of transaction to vote on',
      validateUInt
    )
    .requiredOption('-a, --approve <boolean>', 'true to approve, false to reject', validateBool)
    .option('-p, --profile <string>', 'profile name of voter')
    .action(
      async (options: {
        multisigAddress: string;
        sequenceNumber: number;
        approve: boolean;
        profile: string;
      }) => {
        await handleVoteCommand(options);
      }
    );
};

export async function handleVoteCommand(options: {
  multisigAddress?: string;
  sequenceNumber?: number;
  approve?: boolean;
  profile?: string;
  network?: NetworkChoice;
}) {
  try {
    const profile = await ensureProfileExists(options.profile);
    const network = await ensureNetworkExists(options.network);
    const { signer, fullnode } = await loadProfile(profile, network);
    const aptos = new Aptos(new AptosConfig({ fullnode }));
    const multisig = await ensureMultisigAddressExists(options.multisigAddress);

    const txn = await aptos.transaction.build.simple({
      sender: signer.accountAddress,
      data: {
        function: `0x1::multisig_account::vote_transaction`,
        functionArguments: [multisig, options.sequenceNumber, options.approve],
      },
    });

    // Handle signing and submission
    const pendingTxn = await signAndSubmitTransaction(aptos, signer, txn);
    const { success, vm_status } = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    if (success) {
      console.log(
        chalk.green(
          `Vote ok: ${getExplorerUrl(network, `txn/${pendingTxn.hash}`)}`
        )
      );
    } else {
      console.log(
        chalk.red(
          `Vote nok ${vm_status}: ${getExplorerUrl(network, `txn/${pendingTxn.hash}`)}`
        )
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
  }
}
