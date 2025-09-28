import { Command, Option } from 'commander';
import {
  AccountAddress,
  Aptos,
  generateRawTransaction,
  generateTransactionPayload,
  isUserTransactionResponse,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';
import { decode } from '../parser.js';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';
import { validateAddress } from '../validators.js';
import { signAndSubmitTransaction } from '../signing.js';
import { loadProfile } from '../profiles.js';
import {
  ensureMultisigAddressExists,
  ensureProfileExists,
  ensureNetworkExists,
} from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { getExplorerUrl, initAptos } from '../utils.js';

export const registerExecuteCommand = (program: Command) => {
  program
    .command('execute')
    .description('Execute a multisig transaction')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .option('-p, --profile <string>', 'Profile to use for the transaction')
    .option('--reject', 'Reject the transaction instead of executing it')
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .action(
      async (options: {
        multisigAddress?: string;
        network?: NetworkChoice;
        profile?: string;
        reject?: boolean;
      }) => {
        try {
          const network = await ensureNetworkExists(options.network, options.profile);
          const result = await handleExecuteCommand(
            await ensureMultisigAddressExists(options.multisigAddress),
            await ensureProfileExists(options.profile),
            network,
            options.reject ?? false,
            false
          );
          const action = options.reject ? 'Reject' : 'Execute';
          if (options.reject || result.success) {
            console.log(
              chalk.green(`${action} ok: ${getExplorerUrl(network, `txn/${result.hash}`)}`)
            );
          } else {
            console.log(
              chalk.yellow(
                `${action} committed but failed: ${getExplorerUrl(network, `txn/${result.hash}`)}`
              )
            );
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};

// Also returns success which represents if the multisig transaction
// ends up being successful (it is possible txn committed but failed)
export async function handleExecuteCommand(
  multisig: string,
  profile: string,
  network: NetworkChoice,
  reject: boolean,
  skipConfirmation: boolean
): Promise<{ hash: string; success: boolean }> {
  try {
    const { signer, fullnode } = await loadProfile(profile, network);
    const aptos = initAptos(network, fullnode);

    const [lastResolvedSn] = await aptos.view<[string]>({
      payload: {
        function: '0x1::multisig_account::last_resolved_sequence_number',
        functionArguments: [multisig],
      },
    });

    const [[canReject], [canExecute]] = await Promise.all([
      aptos.view<[boolean]>({
        payload: {
          function: '0x1::multisig_account::can_reject',
          functionArguments: [
            signer.accountAddress.toString(),
            multisig,
            Number(lastResolvedSn) + 1,
          ],
        },
      }),
      aptos.view<[boolean]>({
        payload: {
          function: '0x1::multisig_account::can_execute',
          functionArguments: [
            signer.accountAddress.toString(),
            multisig,
            Number(lastResolvedSn) + 1,
          ],
        },
      }),
    ]);

    // Determine which action to take based on the --reject flag
    let txn: SimpleTransaction;
    let actionName: string;
    const sequenceNum = Number(lastResolvedSn) + 1;

    if (reject) {
      // User explicitly wants to reject
      if (!canReject) {
        throw new Error(
          'Cannot reject this transaction (insufficient no votes or already executed)'
        );
      }

      // Ask for confirmation before rejecting (unless skipped)
      if (!skipConfirmation) {
        const confirmReject = await confirm({
          message: chalk.yellow(`⚠️  Are you sure you want to REJECT transaction #${sequenceNum}?`),
          default: true,
        });

        if (!confirmReject) {
          throw new Error('Rejection cancelled by user');
        }
      }

      txn = await buildRejectTxn(aptos, signer.accountAddress, multisig);
      actionName = 'Reject';
    } else {
      // User wants to execute (default behavior)
      if (!canExecute) {
        if (canReject) {
          throw new Error(
            'Cannot execute this transaction (insufficient yes votes). You can reject it with --reject flag'
          );
        } else {
          throw new Error('Cannot execute this transaction (insufficient yes votes)');
        }
      }

      // Ask for confirmation before executing (unless skipped)
      if (!skipConfirmation) {
        const confirmExecute = await confirm({
          message: chalk.green(`✓ Are you sure you want to EXECUTE transaction #${sequenceNum}?`),
          default: true,
        });

        if (!confirmExecute) {
          throw new Error('Execution cancelled by user');
        }
      }

      txn = await buildApproveTxn(aptos, signer.accountAddress, multisig);
      actionName = 'Execute';
    }

    // Sign & Submit transaction
    const pendingTxn = await signAndSubmitTransaction(aptos, signer, txn);
    const committedTxn = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });
    if (!isUserTransactionResponse(committedTxn)) {
      throw new Error('Internal error: executed a non user transaction');
    }
    const { success, vm_status, events } = committedTxn;
    const txnSuccess = events.some(
      (event) =>
        event.type === '0x1::multisig_account::TransactionExecutionSucceeded' ||
        event.type === '0x1::multisig_account::TransactionExecutionSucceededEvent'
    );
    if (success) {
      return { hash: pendingTxn.hash, success: txnSuccess };
    } else {
      throw new Error(`${actionName} failed with status ${vm_status}`);
    }
  } catch (error) {
    throw new Error(`Execute error: ${(error as Error).message}`);
  }
}

async function buildRejectTxn(
  aptos: Aptos,
  signerAccount: AccountAddress,
  multisig: string
): Promise<SimpleTransaction> {
  return await aptos.transaction.build.simple({
    sender: signerAccount,
    data: {
      function: `0x1::multisig_account::execute_rejected_transaction`,
      functionArguments: [multisig],
    },
  });
}

async function buildApproveTxn(
  aptos: Aptos,
  signerAccount: AccountAddress,
  multisig: string
): Promise<SimpleTransaction> {
  // Get next transaction payload bytes
  const [txnPayloadBytes] = await aptos.view<[string]>({
    payload: {
      function: '0x1::multisig_account::get_next_transaction_payload',
      functionArguments: [multisig, '0x0'],
    },
  });

  // Decode payload bytes into entry function
  const entryFunction = await decode(aptos, txnPayloadBytes);

  // Generate transaction payload
  const txnPayload = await generateTransactionPayload({
    multisigAddress: multisig,
    ...entryFunction,
    aptosConfig: aptos.config,
  });

  // Simulate transaction
  const rawTxn = await generateRawTransaction({
    sender: signerAccount,
    payload: txnPayload,
    aptosConfig: aptos.config,
  });
  const txn = new SimpleTransaction(rawTxn);

  try {
    const [simulation] = await aptos.transaction.simulate.simple({
      transaction: txn,
    });
    if (!simulation.success) {
      throw new Error(`Transaction simulation failed: ${simulation.vm_status}`);
    }
  } catch (error) {
    if (aptos.config.fullnode?.includes('movement')) {
      console.error(
        chalk.yellow(
          `Transaction simulation failed, but this is expected on movement: ${(error as Error).message}`
        )
      );
    } else {
      throw new Error(`Transaction simulation unknown error: ${(error as Error).message}`);
    }
  }
  return txn;
}
