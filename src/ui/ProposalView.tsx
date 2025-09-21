import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import Link from 'ink-link';
import chalk from 'chalk';
import { Aptos } from '@aptos-labs/ts-sdk';
import {
  fetchPendingTxns,
  MultisigTransactionDecoded,
  getBalanceChangesData
} from '@thalalabs/multisig-utils';
import { initAptos, getExplorerUrl } from '../utils.js';
import { handleExecuteCommand } from '../commands/execute.js';
import { handleVoteCommand } from '../commands/vote.js';
import { loadProfile } from '../signing.js';

// Helper function to truncate address uniformly
function truncateAddress(address: string): string {
  if (address.length > 10) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return address;
}

// Reusable AddressLink component
interface AddressLinkProps {
  address: string;
  network: string;
  color?: string;
}

const AddressLink: React.FC<AddressLinkProps> = React.memo(({ address, network, color }) => {
  const url = getExplorerUrl(network as any, `account/${address}`);
  const displayAddr = truncateAddress(address);

  return (
    <Link url={url}>
      {color ? <Text color={color}>{displayAddr}</Text> : displayAddr}
    </Link>
  );
});

// Helper function to format function ID
function formatFunctionId(functionId: string): string {
  const parts = functionId.split('::');
  if (parts.length === 3) {
    const [address, module, func] = parts;
    // Shorten the address for display
    const shortAddr = truncateAddress(address);
    return `${shortAddr}::${module}::${func}`;
  }
  return functionId;
}

// Helper to safely stringify objects with BigInt
function safeStringify(obj: any, indent: number = 2): string {
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }, indent);
}

interface ProposalViewProps {
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
  canReject: boolean;
  userVoteType: 'yes' | 'no' | null;
}

const ProposalView: React.FC<ProposalViewProps> = ({
  multisigAddress,
  network,
  fullnode,
  profile,
  sequenceNumber
}) => {
  const { exit } = useApp();
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isSelectedExpanded, setIsSelectedExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<{ type: 'execute' | 'reject'; seqNum: number } | null>(null);
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

      // Find the minimum sequence number among all proposals
      const minSequenceNumber = txns.length > 0
        ? Math.min(...txns.map(txn => txn.sequence_number))
        : null;

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

          // Only the proposal with smallest sequence number can be executed/rejected
          const isSmallestSeqNum = txn.sequence_number === minSequenceNumber;
          const hasEnoughYesVotes = txn.yesVotes.length >= signaturesRequired;
          const hasEnoughNoVotes = txn.noVotes.length >= signaturesRequired;

          const canExecute = isSmallestSeqNum && hasEnoughYesVotes;
          const canReject = isSmallestSeqNum && hasEnoughNoVotes;

          let userVoteType: 'yes' | 'no' | null = null;
          if (txn.yesVotes.some((addr: any) => addr.toString() === signerAddress)) {
            userVoteType = 'yes';
          } else if (txn.noVotes.some((addr: any) => addr.toString() === signerAddress)) {
            userVoteType = 'no';
          }

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
            canReject,
            userVoteType
          };
        })
      );

      setProposals(processedProposals);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch proposals: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [aptos, multisigAddress, sequenceNumber, signerAddress, signaturesRequired]);

  // Fetch on mount and refresh
  useEffect(() => {
    if (aptos && signaturesRequired > 0) {
      fetchProposals();
    }
  }, [aptos, signaturesRequired, fetchProposals]);

  // Handle vote
  const handleVote = async (seqNum: number, approved: boolean) => {
    try {
      setActionMessage(chalk.yellow(`⏳ ${approved ? 'Submitting Yes vote' : 'Submitting No vote'}... Please wait while the transaction is submitted to the blockchain.`));
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

  // Handle execute with confirmation
  const handleExecute = async (reject: boolean = false) => {
    try {
      const action = reject ? 'Rejecting' : 'Executing';
      const actionPast = reject ? 'Reject' : 'Execute';
      setConfirmAction(null); // Clear confirmation immediately
      setActionMessage(chalk.yellow(`⏳ ${action} transaction... Please wait while the transaction is submitted to the blockchain.`));
      const hash = await handleExecuteCommand(multisigAddress, profile, network as any, reject, true);
      setActionMessage(chalk.green(`✅ ${actionPast} successful: ${getExplorerUrl(network as any, `txn/${hash}`)}`));
      await fetchProposals();
    } catch (error) {
      setActionMessage(chalk.red(`❌ ${reject ? 'Reject' : 'Execute'} failed: ${(error as Error).message}`));
    }
  };

  // Show confirmation prompt
  const showConfirmation = (type: 'execute' | 'reject', seqNum: number) => {
    setConfirmAction({ type, seqNum });
    setActionMessage(''); // Clear any existing message
  };

  // Handle keyboard input
  useInput((input: string, key: any) => {
    // Handle confirmation
    if (confirmAction) {
      if (input === 'y' || input === 'Y') {
        handleExecute(confirmAction.type === 'reject');
      } else {
        setConfirmAction(null);
        setActionMessage('');
      }
      return;
    }

    // Clear action message on any key if showing
    if (actionMessage && !['y', 'n', 'e', 'r'].includes(input)) {
      setActionMessage('');
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
      setIsSelectedExpanded(false); // Collapse when navigating
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(proposals.length - 1, prev + 1));
      setIsSelectedExpanded(false); // Collapse when navigating
    } else if (key.return) {
      // Toggle expand for current selection only
      setIsSelectedExpanded(prev => !prev);
    } else if ((input === 'y' || input === 'n') && proposals[selectedIndex]) {
      handleVote(proposals[selectedIndex].sequenceNumber, input === 'y');
    } else if (input === 'e' && proposals[selectedIndex]) {
      if (proposals[selectedIndex].canExecute) {
        showConfirmation('execute', proposals[selectedIndex].sequenceNumber);
      }
    } else if (input === 'r' && proposals[selectedIndex]) {
      if (proposals[selectedIndex].canReject) {
        showConfirmation('reject', proposals[selectedIndex].sequenceNumber);
      }
    } else if (input === 'l') {
      setActionMessage(chalk.yellow('Loading...'));
      fetchProposals().then(() => {
        setActionMessage(chalk.green('✅ Loaded'));
        setTimeout(() => setActionMessage(''), 2000);
      }).catch((err) => {
        setActionMessage(chalk.red(`❌ Load failed: ${err}`));
      });
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
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>{'Multisig: '.padEnd(10)}<AddressLink address={multisigAddress} network={network} /></Text>
          <Text bold>{'Network:'.padEnd(10)}{network}</Text>
        </Box>
      </Box>

      {/* Table */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          {/* Table Header */}
          <Box>
            <Text>{'  #       │ Function                                        │ Votes         │ Simulation  │ Status'}</Text>
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
              expanded={index === selectedIndex && isSelectedExpanded}
              totalOwners={owners.length}
              signaturesRequired={signaturesRequired}
              network={network}
            />
          ))}
        </Box>
      </Box>

      {/* Action message */}
      {(actionMessage || confirmAction) && (
        <Box
          borderStyle="double"
          borderColor={actionMessage.includes('✅') ? 'green' : actionMessage.includes('❌') ? 'red' : confirmAction ? 'yellow' : 'yellow'}
          padding={1}
        >
          <Box flexDirection="column">
            {confirmAction ? (
              <>
                <Text color={confirmAction.type === 'execute' ? 'green' : 'yellow'}>
                  ⚠️  Confirm {confirmAction.type === 'execute' ? 'EXECUTE' : 'REJECT'} for transaction #{confirmAction.seqNum}?
                </Text>
                <Text>Press [Y] to confirm, [N] to cancel</Text>
              </>
            ) : (
              <>
                <Text>{actionMessage}</Text>
                {!actionMessage.includes('...') && (
                  <Text dimColor>[Press any key to continue]</Text>
                )}
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          {proposals[selectedIndex] && (
            <>
              #{proposals[selectedIndex].sequenceNumber}: {(() => {
                const p = proposals[selectedIndex];
                let actions = '[Y]es [N]o ';
                if (p.canExecute) {
                  actions += '[E]xecute ';
                }
                if (p.canReject) {
                  actions += '[R]eject ';
                }
                return actions;
              })()}
            </>
          )}
          | [↑/↓] Navigate | [Enter] Expand | [L]oad | [Q]uit
        </Text>
      </Box>
    </Box>
  );
};

interface ProposalRowProps {
  proposal: ProposalData;
  selected: boolean;
  expanded: boolean;
  totalOwners: number;
  signaturesRequired: number;
  network: string;
}

interface ProposalExpandedContentProps {
  proposal: ProposalData;
  network: string;
}

// Separate component for expanded content - always shows fresh data when mounted
const ProposalExpandedContent: React.FC<ProposalExpandedContentProps> = ({
  proposal,
  network
}) => {
  // Memoize heavy computations
  const payloadString = useMemo(() =>
    proposal.payload ? safeStringify(proposal.payload) : null,
    [proposal.payload]
  );

  const createdDateString = useMemo(() =>
    new Date(proposal.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    [proposal.createdAt]
  );

  return (
    <Box flexDirection="column" paddingLeft={2}>
      <Text>{'─'.repeat(94)}</Text>

      {/* Created & Creator Box */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Details</Text>
          <Text>Created: {createdDateString}</Text>
          <Text>Creator: <AddressLink address={proposal.creator} network={network} /></Text>
        </Box>
      </Box>

      {/* Votes Box */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Votes</Text>
          {proposal.yesVotes.map((voter, i) => (
            <Text key={`yes-${i}`} color="green">
              {'  '}Y <AddressLink address={voter} network={network} />
            </Text>
          ))}
          {proposal.noVotes.map((voter, i) => (
            <Text key={`no-${i}`} color="red">
              {'  '}N <AddressLink address={voter} network={network} />
            </Text>
          ))}
          {proposal.yesVotes.length === 0 && proposal.noVotes.length === 0 && (
            <Text dimColor>  No votes yet</Text>
          )}
        </Box>
      </Box>

      {/* Payload Box */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Payload</Text>
          <Box paddingTop={1}>
            <Text>{payloadString}</Text>
          </Box>
        </Box>
      </Box>

      {/* Simulation Box */}
      <Box
        borderStyle="single"
        paddingX={1}
        borderColor={proposal.simulationStatus === 'OK' ? 'green' : 'red'}
      >
        <Box flexDirection="column">
          <Text bold>Simulation</Text>
          <Text color={proposal.simulationStatus === 'OK' ? 'green' : 'red'}>
            Status: {proposal.simulationStatus === 'OK' ? 'Success' : 'Failed'}
          </Text>
          {proposal.simulationError && (
            <Text color="red">VM Status: {proposal.simulationError}</Text>
          )}

          {proposal.balanceChanges && proposal.balanceChanges.length > 0 && (
            <>
              <Text></Text>
              <Text dimColor>Balance Changes:</Text>
              {proposal.balanceChanges.map((change: any, i) => {
                const addr = change.address?.toString() || '';
                const changeAmount = change.balanceAfter - change.balanceBefore;
                const changeSign = changeAmount >= 0 ? '+' : '';
                const changeColor = changeAmount >= 0 ? 'green' : 'red';

                return (
                  <Text key={i} color={changeColor}>
                    {'  '}<AddressLink address={addr} network={network} />: {change.balanceBefore} → {change.balanceAfter} {change.symbol} ({changeSign}{changeAmount.toFixed(4)})
                  </Text>
                );
              })}
            </>
          )}
        </Box>
      </Box>

      <Text>{'─'.repeat(94)}</Text>
    </Box>
  );
};

const ProposalRow: React.FC<ProposalRowProps> = React.memo(({
  proposal,
  selected,
  expanded,
  totalOwners,
  network,
}) => {
  const yesCount = proposal.yesVotes.length;
  const noCount = proposal.noVotes.length;
  const pendingCount = totalOwners - yesCount - noCount;

  // Build vote display with bracket notation for user's vote
  let voteDisplay = '';

  // If user voted yes, show it first with brackets
  if (proposal.userVoteType === 'yes') {
    voteDisplay += '[●]';
    // Add remaining yes votes
    for (let i = 1; i < yesCount; i++) {
      voteDisplay += '●';
    }
  } else {
    // Add all yes votes without brackets
    for (let i = 0; i < yesCount; i++) {
      voteDisplay += '●';
    }
  }

  // If user voted no, show it with brackets
  if (proposal.userVoteType === 'no') {
    voteDisplay += '[✗]';
    // Add remaining no votes
    for (let i = 1; i < noCount; i++) {
      voteDisplay += '✗';
    }
  } else {
    // Add all no votes without brackets
    for (let i = 0; i < noCount; i++) {
      voteDisplay += '✗';
    }
  }

  // Add pending votes
  for (let i = 0; i < pendingCount; i++) {
    voteDisplay += '○';
  }

  const votesStr = voteDisplay.padEnd(13);

  // Format function name (truncate if needed)
  const funcName = proposal.function.length > 47
    ? proposal.function.substring(0, 44) + '...'
    : proposal.function.padEnd(47);

  // Format simulation status
  const simColor = proposal.simulationStatus === 'OK' ? 'green' : 'red';
  const simText = proposal.simulationStatus.padEnd(11);

  // Determine status
  let status = '';
  let statusColor: string | undefined;
  if (proposal.canExecute && proposal.canReject) {
    status = 'Execute or Reject';
    statusColor = 'yellow';
  } else if (proposal.canExecute) {
    status = 'Execute ready';
    statusColor = 'green';
  } else if (proposal.canReject) {
    status = 'Reject ready';
    statusColor = 'red';
  } else {
    status = 'Need more votes';
    statusColor = undefined;
  }

  return (
    <Box flexDirection="column">
      {/* Main row */}
      <Box>
        <Text inverse={selected}>
          {selected ? '▶' : ' '} {String(proposal.sequenceNumber).padEnd(7)} │ {funcName} │ {votesStr} │ <Text color={simColor}>{simText}</Text> │ {statusColor ? <Text color={statusColor}>{status}</Text> : status}
        </Text>
      </Box>

      {expanded && <ProposalExpandedContent proposal={proposal} network={network} />}
    </Box>
  );
}, (prevProps, nextProps) => {
  // Custom comparison: only re-render if these specific things change
  return (
    prevProps.selected === nextProps.selected &&
    prevProps.expanded === nextProps.expanded &&
    prevProps.proposal.yesVotes.length === nextProps.proposal.yesVotes.length &&
    prevProps.proposal.noVotes.length === nextProps.proposal.noVotes.length
  );
});

export const runProposalView = (props: ProposalViewProps) => {
  // Check if TTY is available
  if (!process.stdin.isTTY) {
    console.error('Error: This command requires an interactive terminal (TTY).');
    console.error('Please run this command in an interactive terminal.');
    process.exit(1);
  }

  // Enable raw mode for keyboard input
  process.stdin.setRawMode(true);

  render(<ProposalView {...props} />, {
    exitOnCtrlC: false // We'll handle exit ourselves with 'q' key
  });
};