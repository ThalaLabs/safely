import {decode} from "./parser.js";
import {getAllAddressesFromBook} from "./addressBook.js";
import {Aptos} from "@aptos-labs/ts-sdk";

export interface MultisigTransaction {
    payload: { vec: [string] };
    payload_hash: { vec: [string] };
    votes: { data: [{ key: string; value: boolean }] };
    creator: string;
    creation_time_secs: string;
}

export async function fetchPendingTxns(aptos: Aptos, multisig: string, sequence_number: number | undefined) {
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
        const ledgerVersion = await aptos
            .getLedgerInfo()
            .then((info) => BigInt(info.ledger_version));
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
            // Find the index of the entry with the matching alias
            const index = addressBook.addresses.findIndex((entry) => entry.address === key);

            // Use alias if it exists in the map, otherwise fallback to the address
            const humanReadable = addressBook.addresses[index]?.alias || key;
            return `${humanReadable} ${value ? '✅' : '❌'}`;
        })
    );
    const txns = sequenceNumbers.map((sn, i) => ({
        sequence_number: sn,
        ...kept[i],
        payload_decoded: payloadsDecoded[i],
        votes: votesDecoded[i],
    }));

    for (const txn of txns) {
        console.log(txn);
    }
}