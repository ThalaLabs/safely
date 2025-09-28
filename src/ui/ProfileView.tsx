import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import chalk from 'chalk';
import { ProfileDefault, NetworkDefault } from '../storage.js';
import { getAllProfiles, ProfileInfo } from '../profiles.js';
import SharedHeader from './SharedHeader.js';

interface ProfileViewProps {
  onBack?: () => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ onBack }) => {
  const { exit } = useApp();
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentDefault, setCurrentDefault] = useState<string | undefined>();
  const [message, setMessage] = useState<string>('');

  // Load profiles and current default
  useEffect(() => {
    const loadData = async () => {
      const allProfiles = getAllProfiles();
      setProfiles(allProfiles);

      const defaultProfile = await ProfileDefault.get();
      setCurrentDefault(defaultProfile);
    };

    loadData();
  }, []);

  const handleSelectProfile = async (profile: ProfileInfo) => {
    try {
      // Set both profile and network defaults
      await ProfileDefault.set(profile.name);
      await NetworkDefault.set(profile.network);
      setCurrentDefault(profile.name);
      setMessage(chalk.green(`✓ Set "${profile.name}" as default profile (${profile.network})`));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(chalk.red(`✗ Failed to set default: ${error}`));
    }
  };

  const handleClearDefault = async () => {
    try {
      await ProfileDefault.remove();
      await NetworkDefault.remove();
      setCurrentDefault(undefined);
      setMessage(chalk.yellow('✓ Cleared default profile'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(chalk.red(`✗ Failed to clear default: ${error}`));
    }
  };

  useInput((input, key) => {
    const normalizedInput = input?.toLowerCase?.() ?? '';

    // Clear message on any key press
    if (message && !['c', 'b', 'q'].includes(normalizedInput)) {
      setMessage('');
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(profiles.length - 1, prev + 1));
    } else if (key.return && profiles[selectedIndex]) {
      handleSelectProfile(profiles[selectedIndex]);
    } else if (normalizedInput === 'c') {
      handleClearDefault();
    } else if (normalizedInput === 'b') {
      if (onBack) {
        onBack();
      } else {
        exit();
      }
    } else if (normalizedInput === 'q') {
      exit();
    }
  });

  // Group profiles by source
  const aptosProfiles = profiles.filter(p => p.source === 'aptos');
  const movementProfiles = profiles.filter(p => p.source === 'movement');

  return (
    <Box flexDirection="column">
      {/* Shared Header */}
      <SharedHeader subtitle="Profile Management" />

      {/* Profile List */}
      {profiles.length > 0 ? (
        <Box borderStyle="single" paddingX={1}>
          <Box flexDirection="column">
            {aptosProfiles.length > 0 && (
              <>
                <Text bold color="blue">Aptos Profiles:</Text>
                {aptosProfiles.map((profile, index) => {
                  const globalIndex = profiles.indexOf(profile);
                  const isSelected = globalIndex === selectedIndex;
                  const isDefault = profile.name === currentDefault;

                  return (
                    <Box key={`aptos-${profile.name}`}>
                      <Text inverse={isSelected}>
                        {isSelected ? '▶' : ' '} {profile.name}
                        <Text dimColor> ({profile.network})</Text>
                        {profile.address !== '[Private Key]' && profile.address !== '[Ledger]' && (
                          <Text dimColor> - {profile.address.slice(0, 10)}...</Text>
                        )}
                        {profile.address === '[Ledger]' && (
                          <Text dimColor> - Ledger</Text>
                        )}
                        {isDefault && <Text color="green"> ✓</Text>}
                      </Text>
                    </Box>
                  );
                })}
              </>
            )}

            {movementProfiles.length > 0 && (
              <>
                {aptosProfiles.length > 0 && <Text></Text>}
                <Text bold color="magenta">Movement Profiles:</Text>
                {movementProfiles.map((profile) => {
                  const globalIndex = profiles.indexOf(profile);
                  const isSelected = globalIndex === selectedIndex;
                  const isDefault = profile.name === currentDefault;

                  return (
                    <Box key={`movement-${profile.name}`}>
                      <Text inverse={isSelected}>
                        {isSelected ? '▶' : ' '} {profile.name}
                        <Text dimColor> ({profile.network})</Text>
                        {profile.address !== '[Private Key]' && profile.address !== '[Ledger]' && (
                          <Text dimColor> - {profile.address.slice(0, 10)}...</Text>
                        )}
                        {profile.address === '[Ledger]' && (
                          <Text dimColor> - Ledger</Text>
                        )}
                        {isDefault && <Text color="green"> ✓</Text>}
                      </Text>
                    </Box>
                  );
                })}
              </>
            )}
          </Box>
        </Box>
      ) : (
        <Box borderStyle="single" paddingX={1} paddingY={1}>
          <Text color="yellow">
            No profiles found. Please configure profiles in .aptos/config.yaml or .movement/config.yaml
          </Text>
        </Box>
      )}

      {/* Message */}
      {message && (
        <Box borderStyle="double" paddingX={1}>
          <Text>{message}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          {profiles.length > 0 && '[↑/↓] Navigate | [Enter] Set as default | [C]lear default | '}
          [B]ack | [Q]uit
        </Text>
      </Box>
    </Box>
  );
};

export default ProfileView;