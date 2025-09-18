import chalk from 'chalk';
import { MultisigTransactionDecoded } from '@thalalabs/multisig-utils';
import { AddressBook } from '../storage.js';
import { Low } from 'lowdb';

export interface ProposalRow {
  sequenceNumber: number;
  function: string;
  votes: string;
  simulation: string;
  transaction: MultisigTransactionDecoded;
}

export class NativeProposalRenderer {
  public proposals: ProposalRow[] = [];
  private selectedIndex = 0;
  private expandedRows: Set<number> = new Set();
  private lastRefreshedAt: Date = new Date();
  private columnWidths = {
    seq: 8,
    function: 48,
    votes: 10,
    simulation: 12,
    actions: 24,
  };

  constructor(
    private transactions: MultisigTransactionDecoded[],
    private owners: string[],
    private signaturesRequired: number,
    private currentUserAddress: string,
    private safelyStorage: Low<any>,
    private network: string = 'unknown'
  ) {
    this.proposals = this.formatProposals(transactions);
  }

  private formatProposals(transactions: MultisigTransactionDecoded[]): ProposalRow[] {
    return transactions.map((txn) => ({
      sequenceNumber: txn.sequence_number,
      function: this.formatFunctionId(txn.payload_decoded.function),
      votes: this.formatVotes(txn),
      simulation: this.formatSimulation(txn),
      transaction: txn,
    }));
  }

  private formatFunctionId(functionId: string): string {
    const parts = functionId.split('::');
    if (parts.length === 3) {
      const [address, module, func] = parts;
      const truncatedAddress =
        address.length > 16 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
      return `${truncatedAddress}::${module}::${func}`;
    }
    return functionId;
  }

  private formatVotes(txn: MultisigTransactionDecoded): string {
    let yesCount = 0;
    let noCount = 0;

    txn.votes.forEach((vote: string) => {
      if (vote.includes('✅')) {
        yesCount++;
      } else if (vote.includes('❌')) {
        noCount++;
      }
    });

    let voteDisplay = '';
    const totalOwners = this.owners.length;
    const pendingCount = totalOwners - yesCount - noCount;

    for (let i = 0; i < yesCount; i++) {
      voteDisplay += 'Y';
    }
    for (let i = 0; i < noCount; i++) {
      voteDisplay += 'N';
    }
    for (let i = 0; i < pendingCount; i++) {
      voteDisplay += '.';
    }

    return voteDisplay;
  }

  private formatSimulation(txn: MultisigTransactionDecoded): string {
    if (txn.simulationChanges !== undefined) {
      return 'OK';
    }
    if (txn.payload_decoded && !txn.simulationChanges) {
      return 'NOK';
    }
    return '?';
  }

  private padString(str: string, width: number): string {
    const ansiRegex = /\x1b\[[0-9;]*m/g;
    const cleanStr = str.replace(ansiRegex, '');
    const actualLength = cleanStr.length;
    const padding = Math.max(0, width - actualLength);
    return str + ' '.repeat(padding);
  }

  private truncateString(str: string, width: number): string {
    const ansiRegex = /\x1b\[[0-9;]*m/g;
    const cleanStr = str.replace(ansiRegex, '');
    if (cleanStr.length <= width) return str;

    const ellipsis = '...';
    const maxLength = width - ellipsis.length;
    return cleanStr.substring(0, maxLength) + ellipsis;
  }

  private renderTableRow(columns: string[], isSelected: boolean = false): string {
    const [seq, func, votes, sim, actions] = columns;

    const prefix = isSelected ? chalk.yellow('▶ ') : '  ';

    // Left-align sequence numbers consistently
    const formattedSeq = this.padString(seq, this.columnWidths.seq);

    const formattedRow =
      prefix +
      formattedSeq +
      '│ ' +
      this.padString(
        this.truncateString(func, this.columnWidths.function),
        this.columnWidths.function
      ) +
      '│ ' +
      this.padString(votes, this.columnWidths.votes) +
      '│ ' +
      this.padString(sim, this.columnWidths.simulation) +
      '│ ' +
      actions;

    return formattedRow;
  }

  private renderHeader(): string {
    const header = this.renderTableRow(['#', 'Function', 'Votes', 'Simulation', 'Actions']);
    const separator =
      '  ' +
      '─'.repeat(
        this.columnWidths.seq +
          1 +
          this.columnWidths.function +
          1 +
          this.columnWidths.votes +
          1 +
          this.columnWidths.simulation +
          1 +
          this.columnWidths.actions
      );

    return chalk.cyan(header) + '\n' + chalk.gray(separator);
  }

  private formatDetails(txn: MultisigTransactionDecoded): string {
    let details = '';
    const indent = '     ';

    details += chalk.gray('─'.repeat(100)) + '\n';

    const createdDate = new Date(Number(txn.creation_time_secs) * 1000);
    details +=
      indent +
      chalk.gray('Created: ') +
      chalk.gray(createdDate.toISOString().replace('T', ' ').split('.')[0]) +
      '\n';

    if (txn.creator) {
      const creatorAlias = AddressBook.findAliasOrReturnAddress(
        this.safelyStorage.data,
        txn.creator
      );
      details += indent + chalk.gray('Creator: ') + chalk.gray(creatorAlias) + '\n';
    }

    details += '\n' + indent + chalk.gray('Votes:') + '\n';

    const voteMap = new Map<string, string>();
    txn.votes.forEach((vote: string) => {
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

    this.owners.forEach((owner) => {
      const ownerAlias = AddressBook.findAliasOrReturnAddress(this.safelyStorage.data, owner);
      const voteStatus = voteMap.get(owner);
      if (voteStatus === 'yes') {
        details += indent + chalk.gray('  Y ' + ownerAlias) + '\n';
      } else if (voteStatus === 'no') {
        details += indent + chalk.gray('  N ' + ownerAlias) + '\n';
      } else {
        details += indent + chalk.gray('  . ' + ownerAlias) + '\n';
      }
    });

    details += '\n' + indent + chalk.gray('Payload:') + '\n';
    const payload = {
      function: txn.payload_decoded.function,
      type_arguments: txn.payload_decoded.typeArguments || [],
      arguments: txn.payload_decoded.functionArguments || [],
    };

    const payloadJson = JSON.stringify(
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

    payloadJson.split('\n').forEach((line) => {
      details += indent + '  ' + chalk.gray(line) + '\n';
    });

    details += chalk.gray('─'.repeat(100));

    return details;
  }

  public render(multisigAddress: string): string {
    let output = '';

    // Clean header with multisig and network info
    const truncatedAddress =
      multisigAddress.length > 16
        ? `${multisigAddress.slice(0, 6)}...${multisigAddress.slice(-4)}`
        : multisigAddress;

    const timeString = this.lastRefreshedAt.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    output +=
      '\n' +
      chalk.cyan(
        `${truncatedAddress} | ${this.network} | ${this.proposals.length} pending proposals | Last refreshed: ${timeString}\n\n`
      );

    output += this.renderHeader() + '\n';

    for (let i = 0; i < this.proposals.length; i++) {
      const proposal = this.proposals[i];
      const isSelected = i === this.selectedIndex;

      output +=
        this.renderTableRow(
          [
            `${proposal.sequenceNumber}`,
            proposal.function,
            proposal.votes,
            proposal.simulation,
            '[Y]es [N]o [E]xe [F]ull',
          ],
          isSelected
        ) + '\n';

      if (this.expandedRows.has(i)) {
        output += this.formatDetails(proposal.transaction) + '\n';
      }
    }

    output +=
      '\n' +
      chalk.gray(
        '[↑/↓] Navigate | [Enter/F] Toggle details | [Y]es [N]o [E]xe | [R]efresh | [Q]uit'
      );

    return output;
  }

  public updateSelection(previousIndex: number): void {
    // Move cursor to previous selected row and clear the arrow
    const headerLines = 4;
    const lineOffset = this.calculateLineOffset(previousIndex);

    // Move to previous selection line and clear arrow (now just 2 spaces to overwrite "▶ ")
    process.stdout.write(`\x1b[${headerLines + lineOffset}H`); // Move to specific line
    process.stdout.write('  '); // Clear arrow with spaces

    // Move to new selection line
    const newLineOffset = this.calculateLineOffset(this.selectedIndex);
    process.stdout.write(`\x1b[${headerLines + newLineOffset}H`); // Move to new line
    process.stdout.write(chalk.yellow('▶ ')); // Write arrow

    // Move cursor to bottom
    const totalLines = this.calculateTotalLines();
    process.stdout.write(`\x1b[${totalLines}H`);
  }

  private calculateLineOffset(index: number): number {
    let offset = index + 1; // +1 for the separator line

    // Add lines for expanded details above this index
    for (let i = 0; i < index; i++) {
      if (this.expandedRows.has(i)) {
        offset += this.getDetailsLineCount(this.proposals[i].transaction);
      }
    }

    return offset;
  }

  private calculateTotalLines(): number {
    let lines = 4; // Header lines
    lines += this.proposals.length; // One line per proposal

    // Add lines for expanded details
    this.expandedRows.forEach((index) => {
      lines += this.getDetailsLineCount(this.proposals[index].transaction);
    });

    lines += 2; // Footer lines
    return lines;
  }

  private getTotalLines(): number {
    let lines = 6;
    for (let i = 0; i < this.proposals.length; i++) {
      lines++;
      if (this.expandedRows.has(i)) {
        lines += this.getDetailsLineCount(this.proposals[i].transaction);
      }
    }
    lines += 2;
    return lines;
  }

  private getDetailsLineCount(txn: MultisigTransactionDecoded): number {
    let count = 7;
    count += this.owners.length;
    const payload = {
      function: txn.payload_decoded.function,
      type_arguments: txn.payload_decoded.typeArguments || [],
      arguments: txn.payload_decoded.functionArguments || [],
    };
    const payloadJson = JSON.stringify(payload, null, 2);
    count += payloadJson.split('\n').length;
    count += 2;
    return count;
  }

  public moveUp() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
    }
  }

  public moveDown() {
    if (this.selectedIndex < this.proposals.length - 1) {
      this.selectedIndex++;
    }
  }

  public toggleExpanded() {
    if (this.expandedRows.has(this.selectedIndex)) {
      this.expandedRows.delete(this.selectedIndex);
    } else {
      this.expandedRows.add(this.selectedIndex);
    }
  }

  public getSelectedProposal(): ProposalRow | undefined {
    return this.proposals[this.selectedIndex];
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  public updateTransactions(transactions: MultisigTransactionDecoded[]) {
    this.proposals = this.formatProposals(transactions);
    this.lastRefreshedAt = new Date();
    if (this.selectedIndex >= this.proposals.length) {
      this.selectedIndex = this.proposals.length - 1;
    }
    if (this.selectedIndex < 0 && this.proposals.length > 0) {
      this.selectedIndex = 0;
    }
    this.expandedRows.clear();
  }
}
