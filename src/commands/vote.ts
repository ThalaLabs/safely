import { Aptos, AptosConfig } from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import { Command } from 'commander';
import { validateAddress, validateUInt, validateBool } from '../validators.js';
import { loadProfile, signAndSubmitTransaction } from '../signing.js';
import { ensureMultisigAddressExists, ensureProfileExists } from '../storage.js';

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
        handleVoteCommand(options);
      }
    );
};

export async function handleVoteCommand(options: {
  multisigAddress?: string;
  sequenceNumber?: number;
  approve?: boolean;
  profile?: string;
}) {
  try {
    const profile = await ensureProfileExists(options.profile);
    const { network, signer, fullnode } = await loadProfile(profile);
    const aptos = new Aptos(new AptosConfig({ network, ...(fullnode && { fullnode }) }));
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
          `Vote ok: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
        )
      );
    } else {
      console.log(
        chalk.red(
          `Vote nok ${vm_status}: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
        )
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
  }
}
