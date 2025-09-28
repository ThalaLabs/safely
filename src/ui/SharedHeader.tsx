import React from 'react';
import { Box, Text } from 'ink';
import { getProfileByName } from '../profiles.js';

interface SharedHeaderProps {
  subtitle?: string;
  network?: string;
  profile?: string;
  multisig?: string;
}

const SharedHeader: React.FC<SharedHeaderProps> = ({ subtitle, network, profile, multisig }) => {
  // Get profile info for display
  const profileInfo = profile ? getProfileByName(profile) : null;

  // Check for network mismatch
  const networkMismatch = network && profile && profileInfo && profileInfo.network !== network;

  return (
    <>
      {/* Main Title */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold color="cyan">
            Safely - Multisig Management Tool
            {subtitle && <Text color="white"> / {subtitle}</Text>}
          </Text>
        </Box>
      </Box>

      {/* Current Connection */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Connection:</Text>
          <Text>
            Network: {network ? (
              <Text color="green">{network}</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
          <Text>
            Multisig: {multisig ? (
              <Text color="green">{multisig.slice(0, 10)}...</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
          <Text>
            Profile: {profile ? (
              <Text color="green">{profile}</Text>
            ) : <Text color="red">Not set</Text>}
          </Text>
          {networkMismatch && (
            <Text color="yellow">
              ⚠️  Network mismatch! Profile and multisig are on different networks.
            </Text>
          )}
        </Box>
      </Box>
    </>
  );
};

export default SharedHeader;