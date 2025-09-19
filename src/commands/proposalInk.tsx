import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp, Static, render } from 'ink';
import chalk from 'chalk';
import { Aptos } from '@aptos-labs/ts-sdk';
import {
  fetchPendingTxns,
  MultisigTransactionDecoded,
  getBalanceChangesData,
  BalanceChange
} from '@thalalabs/multisig-utils';
import { initAptos, getExplorerUrl } from '../utils.js';
import { handleExecuteCommand } from './execute.js';
import { handleVoteCommand } from './vote.js';
import { loadProfile } from '../signing.js';
import { getDb } from '../storage.js';

// Helper function to format function ID
function formatFunctionId(functionId: string): string {
  const parts = functionId.split('::');
  if (parts.length === 3) {
    const [address, module, func] = parts;
    // Shorten the address for display
    const shortAddr = address.length > 10
      ? `${address.slice(0, 6)}...${address.slice(-4)}`
      : address;
    return `${shortAddr}::${module}::${func}`;
  }
  return functionId;
}

// Helper to safely stringify objects with BigInt
function safeStringify(obj: any, indent: number = 2): string {
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, indent);
}

interface ProposalInkProps {
  multisigAddress: string;
  network: string;
  fullnode?: string;
  profile: string;
  sequenceNumber?: number;
}

interface ProposalData {
  sequenceNumber: number;
  function: string;
  yesVotes: string[];
  noVotes: string[];
  simulationStatus: 'OK' | 'NOK';
  createdAt: number;
  creator: string;
  payload: any;
  simulationError?: string;
  balanceChanges?: any[];
  txn: MultisigTransactionDecoded;
  canExecute: boolean;
  hasVoted: boolean;
}

const ProposalInkApp: React.FC<ProposalInkProps> = ({
  multisigAddress,
  network,
  fullnode,
  profile,
  sequenceNumber
}) => {
  const { exit } = useApp();
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [owners, setOwners] = useState<string[]>([]);
  const [signaturesRequired, setSigRequired] = useState<number>(0);
  const [signerAddress, setSignerAddress] = useState<string>('');
  const [aptos, setAptos] = useState<Aptos | null>(null);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        const profileData = await loadProfile(profile, network as any, true);
        const { signer } = profileData;
        setSignerAddress(signer.accountAddress.toString());

        const aptosInstance = initAptos(network as any, fullnode || profileData.fullnode);
        setAptos(aptosInstance);

        // Get multisig info
        const [[ownersResult], [sigRequired]] = await Promise.all([
          aptosInstance.view<string[][]>({
            payload: {
              function: '0x1::multisig_account::owners',
              functionArguments: [multisigAddress],
            },
          }),
          aptosInstance.view<string[]>({
            payload: {
              function: '0x1::multisig_account::num_signatures_required',
              functionArguments: [multisigAddress],
            },
          }),
        ]);

        setOwners(ownersResult);
        setSigRequired(Number(sigRequired));
      } catch (err) {
        setError(`Failed to initialize: ${err}`);
      }
    };

    init();
  }, []);

  // Fetch proposals
  const fetchProposals = useCallback(async () => {
    if (!aptos) return;

    try {
      setLoading(true);
      const txns = await fetchPendingTxns(aptos, multisigAddress, sequenceNumber);

      const processedProposals: ProposalData[] = await Promise.all(
        txns.map(async (txn) => {
          // Check simulation status
          let simulationStatus: 'OK' | 'NOK' = 'OK';
          let simulationError: string | undefined;
          let balanceChanges: any[] | undefined;

          // Use the simulation status from the transaction (doesn't change with votes)
          if (txn.simulationSuccess !== undefined) {
            simulationStatus = txn.simulationSuccess ? 'OK' : 'NOK';
            if (!txn.simulationSuccess && txn.simulationVmStatus) {
              simulationError = txn.simulationVmStatus;
            }
          }

          // Fetch balance changes if simulation was successful
          if (txn.simulationSuccess && txn.simulationChanges) {
            try {
              balanceChanges = await getBalanceChangesData(aptos, txn.simulationChanges);
            } catch (err) {
              // If we can't get balance changes, continue without them
              console.debug('Could not fetch balance changes:', err);
            }
          }

          // Get function display
          const functionDisplay = txn.payload_decoded.success
            ? formatFunctionId(txn.payload_decoded.data.function)
            : 'Failed to decode';

          const hasVoted = txn.yesVotes.some((addr: any) => addr.toString() === signerAddress) ||
                           txn.noVotes.some((addr: any) => addr.toString() === signerAddress);
          const canExecute = txn.yesVotes.length >= signaturesRequired;

          return {
            sequenceNumber: txn.sequence_number,
            function: functionDisplay,
            yesVotes: txn.yesVotes.map((v: any) => v.toString()),
            noVotes: txn.noVotes.map((v: any) => v.toString()),
            simulationStatus,
            createdAt: Number(txn.creation_time_secs) * 1000,
            creator: txn.creator,
            payload: txn.payload_decoded.success ? txn.payload_decoded.data : null,
            simulationError,
            balanceChanges,
            txn,
            canExecute,
            hasVoted
          };
        })
      );

      setProposals(processedProposals);
      setLastRefreshed(new Date());
      setError(null);
    } catch (err) {
      setError(`Failed to fetch proposals: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [aptos, multisigAddress, sequenceNumber, signerAddress, signaturesRequired]);

  // Fetch on mount and refresh
  useEffect(() => {
    if (aptos) {
      fetchProposals();
    }
  }, [aptos, fetchProposals]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchProposals, 30000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

  // Handle vote
  const handleVote = async (seqNum: number, approved: boolean) => {
    try {
      setActionMessage(chalk.yellow(`${approved ? 'Voting Yes' : 'Voting No'}...`));
      const hash = await handleVoteCommand(
        seqNum,
        approved,
        multisigAddress,
        network as any,
        profile
      );
      setActionMessage(chalk.green(`✅ Vote submitted: ${getExplorerUrl(network as any, `txn/${hash}`)}`));
      await fetchProposals();
    } catch (error) {
      setActionMessage(chalk.red(`❌ Vote failed: ${(error as Error).message}`));
    }
  };

  // Handle execute
  const handleExecute = async () => {
    try {
      setActionMessage(chalk.yellow('Executing transaction...'));
      const hash = await handleExecuteCommand(multisigAddress, profile, network as any);
      setActionMessage(chalk.green(`✅ Execute successful: ${getExplorerUrl(network as any, `txn/${hash}`)}`));
      await fetchProposals();
    } catch (error) {
      setActionMessage(chalk.red(`❌ Execute failed: ${(error as Error).message}`));
    }
  };

  // Handle keyboard input
  useInput((input: string, key: any) => {
    // Clear action message on any key if showing
    if (actionMessage && !['y', 'n', 'e'].includes(input)) {
      setActionMessage('');
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(proposals.length - 1, prev + 1));
    } else if (key.return || input === 'f') {
      // Toggle expand
      setExpandedRows(prev => {
        const newSet = new Set(prev);
        const proposal = proposals[selectedIndex];
        if (proposal) {
          if (newSet.has(proposal.sequenceNumber)) {
            newSet.delete(proposal.sequenceNumber);
          } else {
            newSet.add(proposal.sequenceNumber);
          }
        }
        return newSet;
      });
    } else if ((input === 'y' || input === 'n') && proposals[selectedIndex]) {
      handleVote(proposals[selectedIndex].sequenceNumber, input === 'y');
    } else if (input === 'e' && proposals[selectedIndex]) {
      handleExecute();
    } else if (input === 'r') {
      fetchProposals();
    } else if (input === 'q') {
      exit();
    }
  });

  if (loading && proposals.length === 0) {
    return <Text>Loading proposals...</Text>;
  }

  if (error) {
    return <Text color="red">{error}</Text>;
  }

  if (proposals.length === 0) {
    return <Text color="yellow">No pending transactions found.</Text>;
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>
          {multisigAddress.slice(0, 6)}...{multisigAddress.slice(-4)} | {network} | {proposals.length} pending proposals | Last refreshed: {lastRefreshed.toLocaleTimeString()}
        </Text>
      </Box>

      {/* Table Header */}
      <Box>
        <Text>{'  #       │ Function                                        │ Votes     │ Simulation  │ Actions'}</Text>
      </Box>
      <Box>
        <Text>{'  ' + '─'.repeat(94)}</Text>
      </Box>

      {/* Proposals */}
      {proposals.map((proposal, index) => (
        <ProposalRow
          key={`proposal-${proposal.sequenceNumber}`}
          proposal={proposal}
          selected={index === selectedIndex}
          expanded={expandedRows.has(proposal.sequenceNumber)}
          owners={owners}
          signaturesRequired={signaturesRequired}
        />
      ))}

      {/* Action message */}
      {actionMessage && (
        <Box marginTop={1}>
          <Text>{actionMessage}</Text>
          {!actionMessage.includes('...') && (
            <Text dimColor>[Press any key to continue]</Text>
          )}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          [↑/↓] Navigate | [Enter/F] Toggle details | [Y]es [N]o [E]xe | [R]efresh | [Q]uit
        </Text>
      </Box>
    </Box>
  );
};

interface ProposalRowProps {
  proposal: ProposalData;
  selected: boolean;
  expanded: boolean;
  owners: string[];
  signaturesRequired: number;
}

const ProposalRow: React.FC<ProposalRowProps> = ({
  proposal,
  selected,
  expanded,
  owners,
  signaturesRequired
}) => {
  // Format votes display (like native renderer)
  const yesCount = proposal.yesVotes.length;
  const noCount = proposal.noVotes.length;
  const totalOwners = owners.length;
  const pendingCount = totalOwners - yesCount - noCount;

  let voteDisplay = '';
  for (let i = 0; i < yesCount; i++) voteDisplay += 'Y';
  for (let i = 0; i < noCount; i++) voteDisplay += 'N';
  for (let i = 0; i < pendingCount; i++) voteDisplay += '.';

  const votesStr = voteDisplay.padEnd(9);

  // Format simulation status
  const simColor = proposal.simulationStatus === 'OK' ? 'green' : 'red';
  const simText = proposal.simulationStatus.padEnd(11);

  // Format function name (truncate if needed)
  const funcName = proposal.function.length > 47
    ? proposal.function.substring(0, 44) + '...'
    : proposal.function.padEnd(47);

  // Format actions
  const actions = '[Y]es [N]o [E]xe [F]ull';

  return (
    <Box flexDirection="column">
      {/* Main row */}
      <Box>
        <Text inverse={selected}>
          {selected ? '▶' : ' '} {String(proposal.sequenceNumber).padEnd(7)} │ {funcName} │ {votesStr} │ <Text color={simColor}>{simText}</Text> │ {actions}
        </Text>
      </Box>

      {/* Expanded details */}
      {expanded && (
        <Box flexDirection="column" paddingLeft={2} paddingTop={1} paddingBottom={1}>
          <Text>{'─'.repeat(94)}</Text>
          <Text>Created: {new Date(proposal.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          })}</Text>
          <Text>Creator: {proposal.creator}</Text>
          <Text></Text>

          <Text>Votes:</Text>
          {proposal.yesVotes.map((voter, i) => {
            const ownerIndex = owners.indexOf(voter);
            const displayAddr = voter.slice(0, 6) + '...' + voter.slice(-4);
            return (
              <Text key={`yes-${i}`}>  Y {displayAddr} {ownerIndex >= 0 ? `(Owner ${ownerIndex + 1})` : ''}</Text>
            );
          })}
          {proposal.noVotes.map((voter, i) => {
            const ownerIndex = owners.indexOf(voter);
            const displayAddr = voter.slice(0, 6) + '...' + voter.slice(-4);
            return (
              <Text key={`no-${i}`}>  N {displayAddr} {ownerIndex >= 0 ? `(Owner ${ownerIndex + 1})` : ''}</Text>
            );
          })}

          <Text></Text>
          <Text>Payload:</Text>
          <Box paddingLeft={2}>
            <Text>{safeStringify(proposal.payload)}</Text>
          </Box>

          {proposal.simulationStatus === 'NOK' && (
            <>
              <Text></Text>
              <Text color="red">Simulation Status: Failed</Text>
              {proposal.simulationError && (
                <Text color="red">  VM Status: {proposal.simulationError}</Text>
              )}
            </>
          )}

          {proposal.balanceChanges && proposal.balanceChanges.length > 0 && (
            <>
              <Text></Text>
              <Text dimColor>Balance Changes:</Text>
              {proposal.balanceChanges.map((change: any, i) => {
                // Use full address or alias if available
                const addr = change.address?.toString() || '';

                // Calculate the change amount
                const changeAmount = change.balanceAfter - change.balanceBefore;
                const changeSign = changeAmount >= 0 ? '+' : '';
                const changeColor = changeAmount >= 0 ? 'green' : 'red';

                return (
                  <Text key={i} color={changeColor}>
                    {'  '}{addr}: {change.balanceBefore} → {change.balanceAfter} {change.symbol} ({changeSign}{changeAmount.toFixed(4)})
                  </Text>
                );
              })}
            </>
          )}

          <Text>{'─'.repeat(94)}</Text>
        </Box>
      )}
    </Box>
  );
};

export const runProposalInk = (props: ProposalInkProps) => {
  // Check if TTY is available
  if (!process.stdin.isTTY) {
    console.error('Error: Ink UI requires an interactive terminal (TTY).');
    console.error('The --ink flag is not supported in non-interactive environments.');
    console.error('Please run without the --ink flag or in an interactive terminal.');
    process.exit(1);
  }

  // Enable raw mode for keyboard input
  process.stdin.setRawMode(true);

  render(<ProposalInkApp {...props} />, {
    exitOnCtrlC: false // We'll handle exit ourselves with 'q' key
  });
};