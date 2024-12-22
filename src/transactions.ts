import { decode } from './parser.js';
import { fetchAliasIfPresent, getAllAddressesFromBook } from './addressBook.js';
import {
  Account,
  Aptos,
  generateTransactionPayload,
  InputEntryFunctionData,
  WriteSetChange,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';

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

  const addressBook = await getAllAddressesFromBook();
  const votesDecoded = pendingMove.map((p) =>
    p.votes.data.map(({ key, value }) => {
      const voter = fetchAliasIfPresent(addressBook, key);
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

  const addressBook = await getAllAddressesFromBook();
  for (const [address, changes] of Object.entries(groupedByAddress)) {
    const aliasedAddress = fetchAliasIfPresent(addressBook, address);
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
  sender: Account,
  entryFunction: InputEntryFunctionData,
  multisigAddress: string
) {
  const txnPayload = await generateTransactionPayload({
    multisigAddress,
    ...entryFunction,
    aptosConfig: aptos.config,
  });

  // simulate the actual txn
  const actualTxn = await aptos.transaction.build.simple({
    sender: multisigAddress,
    data: entryFunction,
  });

  const [actualTxnSimulation] = await aptos.transaction.simulate.simple({
    transaction: actualTxn,
  });

  if (!actualTxnSimulation.success) {
    throw new Error(`Actual txn simulation failed: ${actualTxnSimulation.vm_status}`);
  }

  // simulate the create_transaction txn
  const proposeTxn = await aptos.transaction.build.simple({
    sender: sender.accountAddress,
    data: {
      function: '0x1::multisig_account::create_transaction',
      functionArguments: [multisigAddress, txnPayload.multiSig.transaction_payload!.bcsToBytes()],
    },
  });

  const [proposeTxnSimulation] = await aptos.transaction.simulate.simple({
    transaction: proposeTxn,
  });

  if (!proposeTxnSimulation.success) {
    throw new Error(`Propose txn simulation failed: ${proposeTxnSimulation.vm_status}`);
  }

  const authenticator = aptos.transaction.sign({ signer: sender, transaction: proposeTxn });
  const proposeTxnResponse = await aptos.transaction.submit.simple({
    senderAuthenticator: authenticator,
    transaction: proposeTxn,
  });
  await aptos.waitForTransaction({ transactionHash: proposeTxnResponse.hash });
  console.log(
    chalk.green(
      `Transaction proposed successfully: https://explorer.aptoslabs.com/txn/${proposeTxnResponse.hash}?network=${aptos.config.network}`
    )
  );
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
