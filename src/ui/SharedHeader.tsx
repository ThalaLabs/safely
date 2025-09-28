import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ProfileDefault, MultisigDefault, checkNetworkCompatibility } from '../storage.js';
import { getProfileByName } from '../profiles.js';

interface SharedHeaderProps {
  subtitle?: string;
  profile?: string;  // Can be passed directly if known
  multisig?: { address: string; network: string };  // Can be passed directly if known
}

const SharedHeader: React.FC<SharedHeaderProps> = ({ subtitle, profile, multisig }) => {
  const [currentProfile, setCurrentProfile] = useState<string | undefined>(profile);
  const [currentMultisig, setCurrentMultisig] = useState<{ address: string; network: string } | undefined>(multisig);
  const [networkMismatch, setNetworkMismatch] = useState(false);

  // Load current configuration if not passed as props
  useEffect(() => {
    const loadConfig = async () => {
      // Use props if available, otherwise load from storage
      if (!profile) {
        const storedProfile = await ProfileDefault.get();
        setCurrentProfile(storedProfile);
      }

      if (!multisig) {
        const multisigConfig = await MultisigDefault.getConfig();
        if (multisigConfig) {
          setCurrentMultisig({
            address: multisigConfig.address,
            network: multisigConfig.network
          });
        }
      }

      // Check compatibility
      const compatibility = await checkNetworkCompatibility();
      setNetworkMismatch(
        (currentProfile || profile) &&
        (currentMultisig || multisig) &&
        !compatibility.compatible ? true : false
      );
    };

    loadConfig();
  }, [profile, multisig]);

  // Get profile info for display
  const profileInfo = currentProfile ? getProfileByName(currentProfile) : null;

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

      {/* Current Configuration */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Current Configuration:</Text>
          <Text>
            Profile: {currentProfile ? (
              <>
                <Text color="green">{currentProfile}</Text>
                {profileInfo && <Text dimColor> ({profileInfo.network})</Text>}
              </>
            ) : <Text color="red">Not set</Text>}
          </Text>
          <Text>
            Multisig: {currentMultisig ? (
              <>
                <Text color="green">{currentMultisig.address.slice(0, 10)}...</Text>
                <Text dimColor> ({currentMultisig.network})</Text>
              </>
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