import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import AddressLink from './AddressLink.js';

interface SharedHeaderProps {
  subtitle?: string;
  network?: string;
  profile?: string;
  multisig?: string;
  rpcEndpoint?: string;
  isLoading?: boolean;
}

const SharedHeader: React.FC<SharedHeaderProps> = ({ network, profile, multisig, rpcEndpoint, isLoading = false }) => {

  return (
    <>
      {/* Main Title */}
      <Box borderStyle="single" flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          ┌─────────────────────────┐
        </Text>
        <Text bold color="cyan">
          │         SAFELY          │
        </Text>
        <Text bold color="cyan">
          │   — Safe by Design —    │
        </Text>
        <Text bold color="cyan">
          └─────────────────────────┘
        </Text>
      </Box>

      {/* Current Connection */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Connection:</Text>
          <Text>
            Network: {isLoading ? (
              <Text color="cyan"><Spinner type="dots" /> Loading...</Text>
            ) : network ? (
              <Text color="green">{network}</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
          <Text>
            Multisig: {isLoading ? (
              <Text color="cyan"><Spinner type="dots" /> Loading...</Text>
            ) : multisig && network ? (
              <AddressLink address={multisig} network={network} truncate={true} color="green" />
            ) : multisig ? (
              <Text color="green">{multisig.slice(0, 10)}...</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
          <Text>
            Profile: {isLoading ? (
              <Text color="cyan"><Spinner type="dots" /> Loading...</Text>
            ) : profile ? (
              <Text color="green">{profile}</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
          <Text>
            RPC: {isLoading ? (
              <Text color="cyan"><Spinner type="dots" /> Loading...</Text>
            ) : rpcEndpoint ? (
              <Text color="green">{rpcEndpoint}</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
        </Box>
      </Box>
    </>
  );
};

export default SharedHeader;