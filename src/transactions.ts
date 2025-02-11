import { decode } from './parser.js';
import { AddressBook, getDb } from './storage.js';
import {
  Account,
  Aptos,
  generateTransactionPayload,
  InputEntryFunctionData,
  WriteSetChange,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import LedgerSigner from './ledger/LedgerSigner.js';
import { signAndSubmitTransaction } from './signing.js';

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
  payload_decoded: InputEntryFunctionData;
  votes: string[];
}

// Pending Txns

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
  // TODO: handle payload_hash
  const kept = pendingMove.map(({ votes, payload, payload_hash, ...rest }) => rest);
  const payloadsDecoded = await Promise.all(
    pendingMove.map((p) => decode(aptos, p.payload.vec[0]))
  );

  let safelyStorage = await getDb();
  const votesDecoded = pendingMove.map((p) =>
    p.votes.data.map(({ key, value }) => {
      const voter = AddressBook.findAliasOrReturnAddress(safelyStorage.data, key);
      return `${voter} ${value ? '✅' : '❌'}`;
    })
  );

  // return all transactions
  return sequenceNumbers.map((sn, i) => ({
    sequence_number: sn,
    ...kept[i],
    payload_decoded: payloadsDecoded[i],
    votes: votesDecoded[i],
  }));
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

export async function summarizeTransactionSimulation(changes: WriteSetChange[]) {
  const groupedByAddress = changes.reduce(
    (acc, change) => {
      // @ts-ignore
      const { address } = change;
      if (!acc[address]) acc[address] = [];
      acc[address].push(change);
      return acc;
    },
    {} as Record<string, any[]>
  );

  const safelyStorage = await getDb();
  for (const [address, changes] of Object.entries(groupedByAddress)) {
    const aliasedAddress = AddressBook.findAliasOrReturnAddress(safelyStorage.data, address);
    console.log(chalk.green.bold(`Address: ${aliasedAddress}`));

    changes.forEach(({ data, type }) => {
      const resourceName = type.split('::').slice(-1)[0];
      console.log(chalk.yellow(`  - Resource: ${resourceName}`));

      Object.entries(data).forEach(([key, value]) => {
        const summary = summarizeData(value);
        console.log(chalk.gray(`    ${key}: ${summary}`));
      });
    });

    console.log(); // Add spacing between addresses
  }
}

export async function proposeEntryFunction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  entryFunction: InputEntryFunctionData,
  multisigAddress: string
) {
  const txnPayload = await generateTransactionPayload({
    multisigAddress,
    ...entryFunction,
    aptosConfig: aptos.config,
  });

  // TODO: figure out why it keeps failing on devnet & testnet. maybe skip simulation for testnet & devnet?

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
    withFeePayer: true
  });

  const [actualTxnSimulation] = await aptos.transaction.simulate.simple({
    transaction: actualTxn,
  });

  if (!actualTxnSimulation.success) {
    throw new Error(`Actual txn simulation failed: ${actualTxnSimulation.vm_status}`);
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

  const [proposeTxnSimulation] = await aptos.transaction.simulate.simple({
    transaction: proposeTxn,
  });

  if (!proposeTxnSimulation.success) {
    throw new Error(`Propose txn simulation failed: ${proposeTxnSimulation.vm_status}`);
  }

  // Sign & Submit transaction
  const pendingTxn = await signAndSubmitTransaction(aptos, signer, proposeTxn);
  const { success, vm_status } = await aptos.waitForTransaction({
    transactionHash: pendingTxn.hash,
  });
  if (success) {
    console.log(
      chalk.green(
        `Propose ok: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
      )
    );
  } else {
    console.log(
      chalk.red(
        `Propose nok ${vm_status}: https://explorer.aptoslabs.com/txn/${pendingTxn.hash}?network=${aptos.config.network}`
      )
    );
  }
}

// Tx Data

function summarizeData(data: any): string {
  if (!data) return 'No data available';
  if (Array.isArray(data)) return `${data.length} item(s)`;
  if (typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => `${key}: ${summarizeData(value)}`)
      .join(', ');
  }
  if (typeof data == 'boolean') {
    return data.toString();
  }
  return data.toString();
}
