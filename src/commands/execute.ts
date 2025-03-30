import { Command } from 'commander';
import {
  AccountAddress,
  Aptos,
  AptosConfig,
  generateRawTransaction,
  generateTransactionPayload,
  Network,
  SimpleTransaction,
} from '@aptos-labs/ts-sdk';
import { decode } from '../parser.js';
import chalk from 'chalk';
import { validateAddress } from '../validators.js';
import { loadProfile, signAndSubmitTransaction } from '../signing.js';
import { ensureMultisigAddressExists, ensureProfileExists } from '../storage.js';

export const registerExecuteCommand = (program: Command) => {
  program
    .command('execute')
    .description('Execute a multisig transaction')
    .option('-m, --multisig-address <address>', 'multisig account address', validateAddress)
    .option('-p, --profile <string>', 'Profile to use for the transaction')
    .action(async (options: { multisigAddress: string; profile: string }) => {
      await handleExecuteCommand(options);
    });
};

export async function handleExecuteCommand(options: {
  multisigAddress?: string;
  profile?: string;
}) {
  try {
    const profile = await ensureProfileExists(options.profile);
    const { network, signer, fullnode } = await loadProfile(profile);
    const aptos = new Aptos(new AptosConfig({ network, ...(fullnode && { fullnode }) }));
    const multisig = await ensureMultisigAddressExists(options.multisigAddress);

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
      console.error(chalk.red('No executable transaction found'));
      return;
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
      console.log(
        chalk.green(
          `${canReject ? 'Reject' : 'Execute'} ok: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
        )
      );
    } else {
      console.log(
        chalk.red(
          `${canReject ? 'Reject' : 'Execute'} nok ${vm_status}: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
        )
      );
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
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
    if (aptos.config.network === Network.CUSTOM && aptos.config.fullnode?.includes('movement')) {
      console.error(
        chalk.yellow(
          `Transaction simulation failed, but this is expected on movement mainnet: ${(error as Error).message}`
        )
      );
    } else {
      throw new Error(`Transaction simulation unknown error: ${(error as Error).message}`);
    }
  }
  return txn;
}
