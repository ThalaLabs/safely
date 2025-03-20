import { decode } from './parser.js';
import { AddressBook, getDb } from './storage.js';
import {
  Account,
  Aptos,
  generateTransactionPayload,
  InputEntryFunctionData,
  MoveResource,
  WriteSetChange,
  WriteSetChangeWriteResource,
} from '@aptos-labs/ts-sdk';
import chalk from 'chalk';
import Table from 'cli-table3';
import LedgerSigner from './ledger/LedgerSigner.js';
import { signAndSubmitTransaction } from './signing.js';
import { knownAddresses } from './labels.js';

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
  simulationChanges: WriteSetChange[];
}

interface CoinStore {
  coin: { value: string };
}

interface FungibleStore {
  balance: string;
  metadata: { inner: string };
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

  const simulationChanges = await Promise.all(
    payloadsDecoded.map(async (p) => {
      try {
        const transactionToSimulate = await aptos.transaction.build.simple({
          sender: multisig,
          data: p,
          withFeePayer: true,
        });

        // Simulate the transaction, skipping the public/auth key check for both the sender and the fee payer.
        const [simulateMultisigTx] = await aptos.transaction.simulate.simple({
          transaction: transactionToSimulate,
        });

        return simulateMultisigTx.changes;
      } catch (e) {
        // Return no changes if simulation fails
        return [];
      }
    })
  );

  const contracts = payloadsDecoded.map((p) => {
    const [packageAddress] = p.function.split('::');
    return knownAddresses[packageAddress] || 'unknown';
  });

  // return all transactions
  return sequenceNumbers.map((sn, i) => ({
    sequence_number: sn,
    ...kept[i],
    payload_decoded: payloadsDecoded[i],
    contract: contracts[i],
    votes: votesDecoded[i],
    simulationChanges: simulationChanges[i],
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

export async function summarizeTransactionBalanceChanges(
  aptos: Aptos,
  changes: WriteSetChange[]
): Promise<Table> {
  if (!changes) {
    throw new Error('Simulation failed: No transaction changes found');
  }

  const resourceChanges = changes.filter(isWriteSetChangeWriteResource);

  const table = new Table({
    head: [
      chalk.green('Address'),
      chalk.green('Asset'),
      chalk.green('Balance Before'),
      chalk.green('Balance After'),
    ], // Define headers
  });

  const groupedByAddress = resourceChanges.reduce(
    (acc, change) => {
      const { address } = change;
      if (!acc[address]) acc[address] = [];
      acc[address].push(change);
      return acc;
    },
    {} as Record<string, WriteSetChangeWriteResource[]>
  );

  const safelyStorage = await getDb();

  for (const [address, changes] of Object.entries(groupedByAddress)) {
    const aliasedAddress = AddressBook.findAliasOrReturnAddress(safelyStorage.data, address);

    for (const { data } of changes) {
      if (data.type.startsWith('0x1::coin::CoinStore<')) {
        const coinType = data.type.match(/<(.+)>/)?.[1] || 'unknown';
        const coinStore = data.data as CoinStore;
        const balanceAfterRaw = Number(coinStore.coin.value);
        const [decimals, symbol, balanceBeforeRaw] = await Promise.all([
          getCoinDecimals(aptos, coinType),
          getCoinSymbol(aptos, coinType),
          getCoinBalance(aptos, coinType, address),
        ]);
        const balanceAfter = balanceAfterRaw / 10 ** decimals;
        const balanceBefore = balanceBeforeRaw / 10 ** decimals;
        table.push([aliasedAddress, `${coinType} (${symbol})`, balanceBefore, balanceAfter]);
      } else if (data.type.startsWith('0x1::fungible_asset::FungibleStore')) {
        const faStore = data.data as FungibleStore;
        const faType = faStore.metadata.inner;
        const balanceAfterRaw = Number(faStore.balance);
        const [decimals, symbol, balanceBeforeRaw] = await Promise.all([
          getFaDecimals(aptos, faType),
          getFaSymbol(aptos, faType),
          getFABalance(aptos, faType, address),
        ]);
        const balanceAfter = balanceAfterRaw / 10 ** decimals;
        const balanceBefore = balanceBeforeRaw / 10 ** decimals;
        table.push([aliasedAddress, `${faType} (${symbol})`, balanceBefore, balanceAfter]);
      }
    }
  }

  // @ts-ignore
  return table;
}

export async function proposeEntryFunction(
  aptos: Aptos,
  signer: Account | LedgerSigner,
  entryFunction: InputEntryFunctionData,
  multisigAddress: string,
  simulate = true
) {
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

async function getCoinBalance(
  aptos: Aptos,
  assetType: string,
  accountAddress: string
): Promise<number> {
  const [balance] = await aptos.view<[string]>({
    payload: {
      function: '0x1::coin::balance',
      typeArguments: [assetType],
      functionArguments: [accountAddress],
    },
  });

  return Number(balance);
}

async function getCoinDecimals(aptos: Aptos, assetType: string): Promise<number> {
  const [decimals] = await aptos.view<[number]>({
    payload: {
      function: '0x1::coin::decimals',
      typeArguments: [assetType],
      functionArguments: [],
    },
  });

  return decimals;
}

async function getCoinSymbol(aptos: Aptos, assetType: string): Promise<string> {
  const [symbol] = await aptos.view<[string]>({
    payload: {
      function: '0x1::coin::symbol',
      typeArguments: [assetType],
      functionArguments: [],
    },
  });

  return symbol;
}

async function getFABalance(
  aptos: Aptos,
  faMetadata: string,
  accountAddress: string
): Promise<number> {
  const [balance] = await aptos.view<[string]>({
    payload: {
      function: '0x1::primary_fungible_store::balance',
      typeArguments: ['0x1::fungible_asset::Metadata'],
      functionArguments: [accountAddress, faMetadata],
    },
  });

  return Number(balance);
}

async function getFaDecimals(aptos: Aptos, assetType: string): Promise<number> {
  const [decimals] = await aptos.view<[number]>({
    payload: {
      function: '0x1::fungible_asset::decimals',
      typeArguments: [],
      functionArguments: [assetType],
    },
  });

  return decimals;
}

async function getFaSymbol(aptos: Aptos, assetType: string): Promise<string> {
  const [symbol] = await aptos.view<[string]>({
    payload: {
      function: '0x1::fungible_asset::symbol',
      typeArguments: [],
      functionArguments: [assetType],
    },
  });

  return symbol;
}

function isWriteSetChangeWriteResource(
  change: WriteSetChange
): change is WriteSetChangeWriteResource {
  return 'address' in change && 'data' in change && 'type' in (change.data as any);
}
