import { Command, Option } from 'commander';
import {
  AccountAddress,
  Aptos,
  generateRawTransaction,
  generateTransactionPayload,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';
import { decode } from '@thalalabs/multisig-utils';
import chalk from 'chalk';
import { validateAddress } from '../validators.js';
import { loadProfile, signAndSubmitTransaction } from '../signing.js';
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
    .addOption(new Option('--network <network>', 'network to use').choices(NETWORK_CHOICES))
    .action(
      async (options: { multisigAddress?: string; network?: NetworkChoice; profile?: string }) => {
        try {
          const network = await ensureNetworkExists(options.network, options.profile);
          const hash = await handleExecuteCommand(
            await ensureMultisigAddressExists(options.multisigAddress),
            await ensureProfileExists(options.profile),
            network
          );
          console.log(chalk.green(`Execute ok: ${getExplorerUrl(network, `txn/${hash}`)}`));
        } catch (error) {
          console.error(chalk.red(`Error: ${(error as Error).message}`));
        }
      }
    );
};

export async function handleExecuteCommand(
  multisig: string,
  profile: string,
  network: NetworkChoice
): Promise<string> {
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

    if (!canReject && !canExecute) {
      throw new Error('No executable transaction found');
    }

    const txn = canReject
      ? await buildRejectTxn(aptos, signer.accountAddress, multisig)
      : await buildApproveTxn(aptos, signer.accountAddress, multisig);

    // Sign & Submit transaction
    const pendingTxn = await signAndSubmitTransaction(aptos, signer, txn);
    const { success, vm_status } = await aptos.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });
    if (success) {
      return pendingTxn.hash;
    } else {
      throw new Error(`${canReject ? 'Reject' : 'Execute'} failed with status ${vm_status}`);
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
