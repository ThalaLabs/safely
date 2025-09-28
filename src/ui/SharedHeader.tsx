import React from 'react';
import { Box, Text } from 'ink';

interface SharedHeaderProps {
  subtitle?: string;
  network?: string;
  profile?: string;
  multisig?: string;
}

const SharedHeader: React.FC<SharedHeaderProps> = ({ subtitle, network, profile, multisig }) => {

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
        </Box>
      </Box>
    </>
  );
};

export default SharedHeader;