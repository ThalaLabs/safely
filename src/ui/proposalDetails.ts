import chalk from 'chalk';
import {
  MultisigTransactionDecoded,
  summarizeTransactionBalanceChanges,
} from '@thalalabs/multisig-utils';
import { Aptos } from '@aptos-labs/ts-sdk';
import { AddressBook } from '../storage.js';
import { Low } from 'lowdb';

export class ProposalDetailsFormatter {
  constructor(
    private aptos: Aptos,
    private owners: string[],
    private safelyStorage: Low<any>
  ) {}

  public async formatFullDetails(txn: MultisigTransactionDecoded): Promise<string> {
    let details = '';

    // Created date
    details += `   Created: ${new Date().toISOString().replace('T', ' ').split('.')[0]}\n`;

    // Creator (if available)
    if (txn.creator) {
      const creatorAlias = AddressBook.findAliasOrReturnAddress(
        this.safelyStorage.data,
        txn.creator
      );
      details += `   Creator: ${creatorAlias} (${this.truncateAddress(txn.creator)})\n`;
    }
    details += '\n';

    // Votes section
    details += '   Votes:\n';

    // Parse votes to find who voted what
    const voteMap = new Map<string, string>();
    txn.votes.forEach((vote: string) => {
      // Find which owner this vote belongs to
      this.owners.forEach((owner) => {
        if (vote.includes(owner)) {
          if (vote.includes('✅')) {
            voteMap.set(owner, 'yes');
          } else if (vote.includes('❌')) {
            voteMap.set(owner, 'no');
          }
        }
      });
    });

    // Display votes in owner order
    this.owners.forEach((owner) => {
      const ownerAlias = AddressBook.findAliasOrReturnAddress(this.safelyStorage.data, owner);
      const voteStatus = voteMap.get(owner);
      if (voteStatus === 'yes') {
        details += `     ✅ ${ownerAlias}\n`;
      } else if (voteStatus === 'no') {
        details += `     ❌ ${ownerAlias}\n`;
      } else {
        details += `     ⬜ ${ownerAlias}\n`;
      }
    });
    details += '\n';

    // Removed Expected Balance Changes for now

    // Payload
    details += '   Payload:\n';
    const payloadJson = this.formatPayload(txn);
    payloadJson.split('\n').forEach((line) => {
      details += `   ${line}\n`;
    });

    return details;
  }

  private formatPayload(txn: MultisigTransactionDecoded): string {
    const payload = {
      function: txn.payload_decoded.function,
      type_arguments: txn.payload_decoded.typeArguments || [],
      arguments: txn.payload_decoded.functionArguments || [],
    };

    return JSON.stringify(
      payload,
      (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        } else if (value instanceof Uint8Array) {
          return '0x' + Buffer.from(value).toString('hex');
        }
        return value;
      },
      2
    );
  }

  private truncateAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-3)}`;
  }
}
