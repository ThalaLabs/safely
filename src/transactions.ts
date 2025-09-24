import { NetworkChoice } from './constants.js';
import { getExplorerUrl } from './utils.js';
import {
  Account,
  AccountAddress,
  Aptos,
  fetchEntryFunctionAbi,
  generateTransactionPayload,
  InputEntryFunctionData,
  WriteSetChange,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import LedgerSigner from './ledger/LedgerSigner.js';
import { signAndSubmitTransaction } from './signing.js';
import { decode } from './parser.js';

export async function proposeEntryFunction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  entryFunction: InputEntryFunctionData,
  multisigAddress: string,
  network: NetworkChoice,
  simulate: boolean
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

// Types and interfaces
type Result<T, E = string> = { success: true; data: T } | { success: false; error: E };

export interface MultisigTransaction {
  payload: { vec: [string] };
  payload_hash: { vec: [string] };
  votes: { data: [{ key: string; value: boolean }] };
  creator: string;
  creation_time_secs: string;
}

export interface MultisigTransactionDecoded {
  sequence_number: number;
  creation_time_secs: string;
  creator: string;
  payload_decoded: Result<InputEntryFunctionData>;
  yesVotes: AccountAddress[];
  noVotes: AccountAddress[];
  simulationChanges: WriteSetChange[];
  simulationSuccess: boolean;
  simulationVmStatus: string;
}

async function decodeMultisigTransaction(
  aptos: Aptos,
  multisig: string,
  transaction: MultisigTransaction,
  sequenceNumber: number
): Promise<MultisigTransactionDecoded> {
  let payloadDecoded: Result<InputEntryFunctionData>;
  try {
    const decoded = await decode(aptos, transaction.payload.vec[0]);
    payloadDecoded = { success: true, data: decoded };
  } catch (error) {
    payloadDecoded = { success: false, error: (error as Error).message };
  }

  const yesVotes: AccountAddress[] = [];
  const noVotes: AccountAddress[] = [];

  transaction.votes.data.forEach(({ key, value }) => {
    const address = AccountAddress.from(key);
    if (value) {
      yesVotes.push(address);
    } else {
      noVotes.push(address);
    }
  });

  let simulationResult = {
    changes: [] as WriteSetChange[],
    success: false,
    vmStatus: 'PAYLOAD_DECODE_ERROR',
  };

  if (payloadDecoded.success) {
    try {
      const transactionToSimulate = await aptos.transaction.build.simple({
        sender: multisig,
        data: payloadDecoded.data,
        withFeePayer: true,
      });

      const [simulateMultisigTx] = await aptos.transaction.simulate.simple({
        transaction: transactionToSimulate,
      });

      simulationResult = {
        changes: simulateMultisigTx.changes,
        success: simulateMultisigTx.success,
        vmStatus: simulateMultisigTx.vm_status,
      };
    } catch (e) {
      simulationResult = {
        changes: [],
        success: false,
        vmStatus: `SIMULATION_ERROR: ${(e as Error).message}`,
      };
    }
  }

  return {
    sequence_number: sequenceNumber,
    creation_time_secs: transaction.creation_time_secs,
    creator: transaction.creator,
    payload_decoded: payloadDecoded,
    yesVotes,
    noVotes,
    simulationChanges: simulationResult.changes,
    simulationSuccess: simulationResult.success,
    simulationVmStatus: simulationResult.vmStatus,
  };
}

export async function fetchPendingTxns(
  aptos: Aptos,
  multisig: string,
  sequence_number: number | undefined
): Promise<Array<MultisigTransactionDecoded>> {
  let pendingMove: MultisigTransaction[];
  let sequenceNumbers: number[];

  if (sequence_number !== undefined) {
    const [txn] = await aptos.view<[MultisigTransaction]>({
      payload: {
        function: '0x1::multisig_account::get_transaction',
        functionArguments: [multisig, sequence_number],
      },
    });
    pendingMove = [txn];
    sequenceNumbers = [sequence_number];
  } else {
    const ledgerVersion = await aptos.getLedgerInfo().then((info) => BigInt(info.ledger_version));
    const lastResolvedSnPromise = aptos.view({
      payload: {
        function: '0x1::multisig_account::last_resolved_sequence_number',
        functionArguments: [multisig],
      },
      options: {
        ledgerVersion,
      },
    });
    const nextSnPromise = aptos.view({
      payload: {
        function: '0x1::multisig_account::next_sequence_number',
        functionArguments: [multisig],
      },
      options: {
        ledgerVersion,
      },
    });
    const pendingPromise = aptos.view<[MultisigTransaction[]]>({
      payload: {
        function: '0x1::multisig_account::get_pending_transactions',
        functionArguments: [multisig],
      },
      options: {
        ledgerVersion,
      },
    });
    const [[lastResolvedSnMove], [nextSnMove], [pending]] = await Promise.all([
      lastResolvedSnPromise,
      nextSnPromise,
      pendingPromise,
    ]);

    const lastResolvedSn = Number(lastResolvedSnMove as string);
    const nextSn = Number(nextSnMove as string);
    sequenceNumbers = Array.from(
      { length: nextSn - lastResolvedSn - 1 },
      (_, i) => lastResolvedSn + (i + 1)
    );
    pendingMove = pending;
  }

  return Promise.all(
    pendingMove.map((transaction, index) =>
      decodeMultisigTransaction(aptos, multisig, transaction, sequenceNumbers[index])
    )
  );
}

export async function numPendingTxns(aptos: Aptos, multisig: string): Promise<number> {
  const ledgerVersion = await aptos.getLedgerInfo().then((info) => BigInt(info.ledger_version));
  const lastResolvedSnPromise = aptos.view({
    payload: {
      function: '0x1::multisig_account::last_resolved_sequence_number',
      functionArguments: [multisig],
    },
    options: {
      ledgerVersion,
    },
  });
  const nextSnPromise = aptos.view({
    payload: {
      function: '0x1::multisig_account::next_sequence_number',
      functionArguments: [multisig],
    },
    options: {
      ledgerVersion,
    },
  });

  const [[lastResolvedSnMove], [nextSnMove]] = await Promise.all([
    lastResolvedSnPromise,
    nextSnPromise,
  ]);

  return Number(nextSnMove as string) - Number(lastResolvedSnMove as string) - 1;
}
