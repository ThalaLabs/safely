import Table from 'cli-table3';
import chalk from 'chalk';
import { MultisigTransactionDecoded } from '@thalalabs/multisig-utils';
import { Aptos } from '@aptos-labs/ts-sdk';

export interface ProposalDisplay {
  sequenceNumber: number;
  function: string;
  votes: string;
  simulation: string;
  actions: string;
  fullDetails?: string;
  isExpanded?: boolean;
  transaction: MultisigTransactionDecoded;
}

export class ProposalTableRenderer {
  private proposals: ProposalDisplay[] = [];
  private selectedIndex = 0;
  private expandedRows: Set<number> = new Set();

  constructor(
    private transactions: MultisigTransactionDecoded[],
    private owners: string[],
    private signaturesRequired: number,
    private currentUserAddress: string
  ) {
    this.proposals = this.formatProposals(transactions);
  }

  private formatProposals(transactions: MultisigTransactionDecoded[]): ProposalDisplay[] {
    return transactions.map((txn) => {
      const votes = this.formatVotes(txn);
      const simulation = this.formatSimulation(txn);
      const actions = this.formatActions(txn);

      return {
        sequenceNumber: txn.sequence_number,
        function: this.formatFunctionId(txn.payload_decoded.function),
        votes,
        simulation,
        actions,
        transaction: txn,
      };
    });
  }

  private formatFunctionId(functionId: string): string {
    // Function ID format: 0xaddress::module::function
    const parts = functionId.split('::');
    if (parts.length === 3) {
      const [address, module, func] = parts;
      // Truncate the address part (keep first 6 and last 4 chars)
      const truncatedAddress =
        address.length > 16 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
      return `${truncatedAddress}::${module}::${func}`;
    }
    return functionId;
  }

  private formatVotes(txn: MultisigTransactionDecoded): string {
    // Count votes
    let yesCount = 0;
    let noCount = 0;

    // Count yes and no votes from the transaction
    txn.votes.forEach((vote: string) => {
      if (vote.includes('✅')) {
        yesCount++;
      } else if (vote.includes('❌')) {
        noCount++;
      }
    });

    // Build visual representation: yes votes first, then no votes, then pending
    let voteDisplay = '';
    const totalOwners = this.owners.length;
    const pendingCount = totalOwners - yesCount - noCount;

    // Add yes votes
    for (let i = 0; i < yesCount; i++) {
      voteDisplay += '✅';
    }

    // Add no votes
    for (let i = 0; i < noCount; i++) {
      voteDisplay += '❌';
    }

    // Add pending votes
    for (let i = 0; i < pendingCount; i++) {
      voteDisplay += '⬜';
    }

    return voteDisplay;
  }

  private formatSimulation(txn: MultisigTransactionDecoded): string {
    // Check if simulation exists and succeeded
    if (txn.simulationChanges !== undefined) {
      return chalk.green('OK');
    }
    // If there's a simulation error, show NOK
    if (txn.payload_decoded && !txn.simulationChanges) {
      return chalk.red('NOK');
    }
    return chalk.yellow('?');
  }

  private formatActions(txn: MultisigTransactionDecoded): string {
    // Always show all actions, let the user decide what they can do
    return '[Y]es [N]o [E]xe [F]ull';
  }

  private canUserVote(txn: MultisigTransactionDecoded): boolean {
    // Check if current user has already voted
    const hasVoted = txn.votes.some((vote: string) => {
      // Check if this vote belongs to the current user
      return vote.includes(this.currentUserAddress);
    });

    // Can vote if user is owner and hasn't voted yet
    const isOwner = this.owners.includes(this.currentUserAddress);
    return isOwner && !hasVoted && !this.isTransactionRejected(txn);
  }

  private canTransactionExecute(txn: MultisigTransactionDecoded): boolean {
    // Count yes votes (votes with ✅)
    const yesVotes = txn.votes.filter((vote: string) => vote.includes('✅')).length;
    return yesVotes >= this.signaturesRequired && !this.isTransactionRejected(txn);
  }

  private isTransactionRejected(txn: MultisigTransactionDecoded): boolean {
    // Count no votes (votes with ❌)
    const noVotes = txn.votes.filter((vote: string) => vote.includes('❌')).length;
    const threshold = this.owners.length - this.signaturesRequired + 1;
    return noVotes >= threshold;
  }

  public async render(
    multisigAddress: string,
    detailsFormatter: any,
    showSelection: boolean = true
  ): Promise<string> {
    const table = new Table({
      head: ['#', 'Function', 'Votes', 'Simulation', 'Actions'],
      colWidths: [8, 48, 15, 12, 24],
      style: { head: ['cyan'] },
      wordWrap: true,
    });

    for (let index = 0; index < this.proposals.length; index++) {
      const proposal = this.proposals[index];
      // Only show selection arrow when in full render mode (not during navigation)
      const row = [
        ` ${proposal.sequenceNumber}`,
        proposal.function,
        proposal.votes,
        proposal.simulation,
        proposal.actions,
      ];

      table.push(row);

      // Add expanded details if this row is expanded
      if (this.expandedRows.has(index)) {
        const fullDetails = await detailsFormatter.formatFullDetails(proposal.transaction);
        const detailsRow = [
          {
            colSpan: 5,
            content: fullDetails,
          },
        ];
        table.push(detailsRow);
      }
    }

    let output =
      chalk.blue(`\nPending Proposals for ${multisigAddress}`) +
      '                                                    ' +
      chalk.cyan('[R]efresh | [Q]uit\n\n');
    output += table.toString();
    output +=
      '\n\n' +
      chalk.gray('[↑/↓] Navigate | [Enter/F] View full details | Press key for action | [Q]uit');

    return output;
  }

  public renderSelectionStatus(): string {
    const selected = this.getSelectedProposal();
    if (!selected) return '';

    const statusLine = chalk.yellow(
      `\n▶ Selected: Transaction #${selected.sequenceNumber} - ${selected.function}`
    );
    const actionHint = chalk.gray(`  Press [E] to execute, [Y/N] to vote, [F] for details`);

    return statusLine + '\n' + actionHint;
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

  public getSelectedProposal(): ProposalDisplay | undefined {
    return this.proposals[this.selectedIndex];
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  public isRowExpanded(index: number): boolean {
    return this.expandedRows.has(index);
  }

  public updateTransactions(transactions: MultisigTransactionDecoded[]) {
    this.proposals = this.formatProposals(transactions);
    // Reset selection if it's out of bounds
    if (this.selectedIndex >= this.proposals.length) {
      this.selectedIndex = this.proposals.length - 1;
    }
    if (this.selectedIndex < 0 && this.proposals.length > 0) {
      this.selectedIndex = 0;
    }
  }
}
