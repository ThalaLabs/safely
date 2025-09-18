import { AddressBook, getDb } from './storage.js';
import { NetworkChoice } from './constants.js';
import { getExplorerUrl } from './utils.js';
import {
  Account,
  Aptos,
  fetchEntryFunctionAbi,
  generateTransactionPayload,
  InputEntryFunctionData,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import LedgerSigner from './ledger/LedgerSigner.js';
import { signAndSubmitTransaction } from './signing.js';
import { MultisigTransactionDecoded, fetchPendingTxns } from '@thalalabs/multisig-utils';

// Pending Txns

export async function fetchPendingTxnsSafely(
  aptos: Aptos,
  multisig: string,
  sequence_number: number | undefined
): Promise<Array<MultisigTransactionDecoded>> {
  let pendingTxns = await fetchPendingTxns(aptos, multisig, sequence_number);

  let safelyStorage = await getDb();
  const votesDecoded = pendingTxns.map((p) =>
    p.votes.map((key) => {
      const parsedVoter = key.split(' ');
      let voterAddress = parsedVoter[0];
      let vote = parsedVoter[1];
      const voter = AddressBook.findAliasOrReturnAddress(safelyStorage.data, voterAddress);
      return `${voter} ${vote}`;
    })
  );

  pendingTxns.forEach((txn, i) => (txn.votes = votesDecoded[i]));

  // return all transactions
  // @ts-ignore
  return pendingTxns;
}

// Helper functions for proposal UI
export async function canUserVote(
  aptos: Aptos,
  multisigAddress: string,
  userAddress: string,
  sequenceNumber: number
): Promise<boolean> {
  try {
    const [canVote] = await aptos.view<[boolean]>({
      payload: {
        function: '0x1::multisig_account::can_vote',
        functionArguments: [userAddress, multisigAddress, sequenceNumber],
      },
    });
    return canVote;
  } catch {
    return false;
  }
}

export async function canUserExecute(
  aptos: Aptos,
  multisigAddress: string,
  userAddress: string,
  sequenceNumber: number
): Promise<boolean> {
  try {
    const [canExecute] = await aptos.view<[boolean]>({
      payload: {
        function: '0x1::multisig_account::can_execute',
        functionArguments: [userAddress, multisigAddress, sequenceNumber],
      },
    });
    return canExecute;
  } catch {
    return false;
  }
}

export async function canUserReject(
  aptos: Aptos,
  multisigAddress: string,
  userAddress: string,
  sequenceNumber: number
): Promise<boolean> {
  try {
    const [canReject] = await aptos.view<[boolean]>({
      payload: {
        function: '0x1::multisig_account::can_reject',
        functionArguments: [userAddress, multisigAddress, sequenceNumber],
      },
    });
    return canReject;
  } catch {
    return false;
  }
}

export async function proposeEntryFunction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  entryFunction: InputEntryFunctionData,
  multisigAddress: string,
  network: NetworkChoice,
  simulate = true
) {
  // Fetch ABI
  let entryFunctionABI = await fetchEntryFunctionAbi(
    entryFunction.function.split('::')[0],
    entryFunction.function.split('::')[1],
    entryFunction.function.split('::')[2],
    aptos.config
  );

  entryFunction = {
    ...entryFunction,
    abi: entryFunctionABI,
  };

  const txnPayload = await generateTransactionPayload({
    multisigAddress,
    ...entryFunction,
    aptosConfig: aptos.config,
  });

  // TODO: figure out why it keeps failing on devnet & testnet. maybe skip simulation for testnet & devnet?

  if (simulate) {
    // simulate the actual txn
    // A "fee payer" is used for simulations to ensure:
    // 1. Users are able to simulate the proposed transaction in advance of vote/execution stages
    // 2. Funds are not required on the multisig account to propose transactions
    //
    // On-chain multisig behaviour occurs as follows:
    // a) User_1 calls create_transaction
    // b) Users_1..N approve txn by calling "vote"
    // c) User_1 calls execute_transaction
    // The simulation step below verifies that the txn from step (a) will succeed, however
    // this simulation behaviour (where the multisig is the sender of the txn) will never actually occur on-chain.
    // This is because the proposed tx bytes are included in the "create_transaction" call from step (a).
    // Adding "withFeePayer" lets safely avoid "invalid balance" errors that comes from this simulation step.
    // These errors occur because the use of "sender: <multisig>" includes a check that the multisig has sufficient balance.
    // This is not actually important because no txn is executed with sender: multisig on-chain -- only multisig owners send txns
    const actualTxn = await aptos.transaction.build.simple({
      sender: multisigAddress,
      data: entryFunction,
      withFeePayer: true,
    });

    const [actualTxnSimulation] = await aptos.transaction.simulate.simple({
      transaction: actualTxn,
    });

    if (!actualTxnSimulation.success) {
      throw new Error(`Actual txn simulation failed: ${actualTxnSimulation.vm_status}`);
    }
  }

  // simulate the create_transaction txn
  const proposeTxn = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: {
      function: '0x1::multisig_account::create_transaction',
      functionArguments: [multisigAddress, txnPayload.multiSig.transaction_payload!.bcsToBytes()],
    },
  });

  // TODO: figure out why simulation keeps failing on devnet & testnet. maybe skip simulation for testnet & devnet?

  if (simulate) {
    const [proposeTxnSimulation] = await aptos.transaction.simulate.simple({
      transaction: proposeTxn,
    });

    if (!proposeTxnSimulation.success) {
      throw new Error(`Propose txn simulation failed: ${proposeTxnSimulation.vm_status}`);
    }
  }

  // Sign & Submit transaction
  const pendingTxn = await signAndSubmitTransaction(aptos, signer, proposeTxn);
  const { success, vm_status } = await aptos.waitForTransaction({
    transactionHash: pendingTxn.hash,
  });
  if (success) {
    console.log(chalk.green(`Propose ok: ${getExplorerUrl(network, `txn/${pendingTxn.hash}`)}`));
  } else {
    console.log(
      chalk.red(`Propose nok ${vm_status}: ${getExplorerUrl(network, `txn/${pendingTxn.hash}`)}`)
    );
  }
}
