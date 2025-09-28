import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { ProfileDefault, MultisigDefault, NetworkDefault } from '../storage.js';
import { getAllProfiles, ProfileInfo } from '../profiles.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { validateAddress } from '../validators.js';
import ProposalView from './ProposalView.js';
import SharedHeader from './SharedHeader.js';

interface HomeViewProps {
  onNavigate?: (view: 'proposal') => void;
}

type ExpandedSection = 'network' | 'multisig' | 'profile' | null;

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [expandedSection, setExpandedSection] = useState<ExpandedSection>(null);
  const [networkSubIndex, setNetworkSubIndex] = useState(0);
  const [profileSubIndex, setProfileSubIndex] = useState(0);

  // Current values
  const [currentNetwork, setCurrentNetwork] = useState<NetworkChoice | undefined>();
  const [currentMultisig, setCurrentMultisig] = useState<string | undefined>();
  const [currentProfile, setCurrentProfile] = useState<string | undefined>();

  // All profiles
  const [allProfiles, setAllProfiles] = useState<ProfileInfo[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<ProfileInfo[]>([]);

  // Multisig input
  const [multisigInput, setMultisigInput] = useState('');
  const [multisigError, setMultisigError] = useState('');

  // View state
  const [currentView, setCurrentView] = useState<'home' | 'proposal'>('home');

  // Load current configuration and profiles
  useEffect(() => {
    const loadConfig = async () => {
      const network = await NetworkDefault.get();
      const multisigConfig = await MultisigDefault.getConfig();
      const profile = await ProfileDefault.get();
      const profiles = getAllProfiles();

      setCurrentNetwork(network);
      if (multisigConfig && multisigConfig.network === network) {
        setCurrentMultisig(multisigConfig.address);
      } else {
        setCurrentMultisig(undefined);
      }
      setCurrentProfile(profile);
      setAllProfiles(profiles);

      // Filter profiles for current network
      if (network) {
        setFilteredProfiles(profiles.filter(p => p.network === network));
      }
    };

    loadConfig();
  }, []);

  // Update filtered profiles when network changes
  useEffect(() => {
    if (currentNetwork) {
      setFilteredProfiles(allProfiles.filter(p => p.network === currentNetwork));
    } else {
      setFilteredProfiles([]);
    }
  }, [currentNetwork, allProfiles]);

  // Check if proposals can be accessed
  const canAccessProposals = currentNetwork && currentProfile && currentMultisig &&
    filteredProfiles.some(p => p.name === currentProfile);

  const menuItems = [
    { label: 'Network', type: 'network' as const },
    { label: 'Multisig', type: 'multisig' as const },
    { label: 'Profile', type: 'profile' as const },
    { label: 'Proposals', type: 'proposals' as const },
  ];

  const handleNetworkSelect = async (network: NetworkChoice) => {
    await NetworkDefault.set(network);
    setCurrentNetwork(network);

    // Clear multisig if it's from a different network
    const multisigConfig = await MultisigDefault.getConfig();
    if (multisigConfig && multisigConfig.network !== network) {
      setCurrentMultisig(undefined);
    }

    // Clear profile if not compatible with new network
    if (currentProfile && !allProfiles.some(p => p.name === currentProfile && p.network === network)) {
      setCurrentProfile(undefined);
      await ProfileDefault.remove();
    }

    setExpandedSection(null);
  };

  const handleProfileSelect = async (profileName: string) => {
    await ProfileDefault.set(profileName);
    setCurrentProfile(profileName);
    setExpandedSection(null);
  };

  const handleMultisigSave = async () => {
    try {
      validateAddress(multisigInput);
      if (currentNetwork) {
        await MultisigDefault.set(multisigInput, currentNetwork);
        setCurrentMultisig(multisigInput);
        setMultisigError('');
        setExpandedSection(null);
        setMultisigInput('');
      }
    } catch (error) {
      setMultisigError(String(error).replace('Error: ', ''));
    }
  };

  useInput((input, key) => {
    const normalizedInput = input?.toLowerCase?.() ?? '';

    if (currentView === 'proposal') {
      return;
    }

    // Handle expanded sections
    if (expandedSection === 'network') {
      if (key.upArrow) {
        setNetworkSubIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        const networks = NETWORK_CHOICES.filter(n => n !== 'custom');
        setNetworkSubIndex(prev => Math.min(networks.length - 1, prev + 1));
      } else if (key.return) {
        const networks = NETWORK_CHOICES.filter(n => n !== 'custom');
        handleNetworkSelect(networks[networkSubIndex] as NetworkChoice);
      } else if (key.escape) {
        setExpandedSection(null);
      }
    } else if (expandedSection === 'profile') {
      if (key.upArrow) {
        setProfileSubIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setProfileSubIndex(prev => Math.min(filteredProfiles.length - 1, prev + 1));
      } else if (key.return && filteredProfiles[profileSubIndex]) {
        handleProfileSelect(filteredProfiles[profileSubIndex].name);
      } else if (key.escape) {
        setExpandedSection(null);
      }
    } else if (expandedSection === 'multisig') {
      if (key.return) {
        handleMultisigSave();
      } else if (key.escape) {
        setExpandedSection(null);
        setMultisigInput('');
        setMultisigError('');
      }
    } else {
      // Main menu navigation
      if (key.upArrow) {
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedIndex(prev => Math.min(menuItems.length - 1, prev + 1));
      } else if (key.return) {
        const selectedItem = menuItems[selectedIndex];

        if (selectedItem.type === 'proposals') {
          if (canAccessProposals) {
            setCurrentView('proposal');
            if (onNavigate) {
              onNavigate('proposal');
            }
          }
        } else if (selectedItem.type === 'network') {
          setExpandedSection('network');
          // Find current network index
          const networks = NETWORK_CHOICES.filter(n => n !== 'custom');
          const currentIndex = currentNetwork && currentNetwork !== 'custom' ? networks.indexOf(currentNetwork) : -1;
          setNetworkSubIndex(currentIndex >= 0 ? currentIndex : 0);
        } else if (selectedItem.type === 'multisig' && currentNetwork) {
          setExpandedSection('multisig');
          setMultisigInput(currentMultisig || '');
        } else if (selectedItem.type === 'profile' && currentNetwork) {
          setExpandedSection('profile');
          // Find current profile index
          const currentIndex = filteredProfiles.findIndex(p => p.name === currentProfile);
          setProfileSubIndex(currentIndex >= 0 ? currentIndex : 0);
        }
      } else if (normalizedInput === 'q') {
        exit();
      }
    }
  });

  // Handle navigation from proposal view
  const handleBack = () => {
    setCurrentView('home');
  };

  // Render proposal view if selected
  if (currentView === 'proposal' && canAccessProposals && currentNetwork) {
    return <ProposalView
      profile={currentProfile}
      multisigAddress={currentMultisig}
      network={currentNetwork}
      onBack={handleBack}
    />;
  }

  return (
    <Box flexDirection="column">
      {/* Shared Header */}
      <SharedHeader subtitle="Main Menu" />

      {/* Menu */}
      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          <Text bold>Configuration:</Text>

          {/* Network Section */}
          {expandedSection === 'network' ? (
            <>
              <Text inverse={selectedIndex === 0}>▼ Network:</Text>
              {NETWORK_CHOICES.filter(n => n !== 'custom').map((network, index) => (
                <Text key={network} inverse={index === networkSubIndex}>
                  {'  '}{index === networkSubIndex ? '▶' : ' '} {network}
                  {network === currentNetwork && <Text color="green"> ✓</Text>}
                </Text>
              ))}
            </>
          ) : (
            <Text inverse={selectedIndex === 0}>
              {selectedIndex === 0 ? '▶' : ' '} Network: {currentNetwork ? (
                <Text color="cyan">{currentNetwork} ✓</Text>
              ) : (
                <Text dimColor>(Select network)</Text>
              )}
            </Text>
          )}

          {/* Multisig Section */}
          {expandedSection === 'multisig' ? (
            <>
              <Text inverse={selectedIndex === 1}>▼ Multisig:</Text>
              <Box paddingLeft={2}>
                <Text>Address: </Text>
                <TextInput
                  value={multisigInput}
                  onChange={setMultisigInput}
                  placeholder="0x..."
                />
              </Box>
              {multisigError && (
                <Text color="red">  ✗ {multisigError}</Text>
              )}
              <Text dimColor>  [Enter] Save | [Esc] Cancel</Text>
            </>
          ) : (
            <Text inverse={selectedIndex === 1}>
              {selectedIndex === 1 ? '▶' : ' '} Multisig: {!currentNetwork ? (
                <Text dimColor>(Select network first)</Text>
              ) : currentMultisig ? (
                <Text color="cyan">{currentMultisig.slice(0, 10)}... ✓</Text>
              ) : (
                <Text dimColor>(Enter address)</Text>
              )}
            </Text>
          )}

          {/* Profile Section */}
          {expandedSection === 'profile' ? (
            <>
              <Text inverse={selectedIndex === 2}>▼ Profile:</Text>
              {filteredProfiles.length > 0 ? (
                filteredProfiles.map((profile, index) => (
                  <Text key={profile.name} inverse={index === profileSubIndex}>
                    {'  '}{index === profileSubIndex ? '▶' : ' '} {profile.name}
                    {profile.name === currentProfile && <Text color="green"> ✓</Text>}
                  </Text>
                ))
              ) : (
                <Text dimColor>  No profiles found for {currentNetwork}</Text>
              )}
            </>
          ) : (
            <Text inverse={selectedIndex === 2}>
              {selectedIndex === 2 ? '▶' : ' '} Profile: {!currentNetwork ? (
                <Text dimColor>(Select network first)</Text>
              ) : currentProfile && filteredProfiles.some(p => p.name === currentProfile) ? (
                <Text color="cyan">{currentProfile} ✓</Text>
              ) : filteredProfiles.length === 0 ? (
                <Text dimColor>(No profiles for {currentNetwork})</Text>
              ) : (
                <Text dimColor>(Select profile)</Text>
              )}
            </Text>
          )}

          <Text></Text>
          <Text bold>Actions:</Text>

          {/* Proposals Section */}
          <Text inverse={selectedIndex === 3}>
            {selectedIndex === 3 ? '▶' : ' '} Proposals
            {canAccessProposals ? (
              <Text color="green"> ✓</Text>
            ) : (
              <Text dimColor> (Configure above first)</Text>
            )}
          </Text>
        </Box>
      </Box>

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          {expandedSection ?
            '[↑/↓] Navigate | [Enter] Select | [Esc] Back | [Q]uit' :
            '[↑/↓] Navigate | [Enter] Select/Expand | [Q]uit'}
        </Text>
      </Box>
    </Box>
  );
};

export const runHomeView = () => {
  // Check if TTY is available
  if (!process.stdin.isTTY) {
    console.error('Error: This command requires an interactive terminal (TTY).');
    console.error('Please run this command in an interactive terminal.');
    process.exit(1);
  }

  // Enable raw mode for keyboard input
  process.stdin.setRawMode(true);

  render(<HomeView />, {
    exitOnCtrlC: false
  });
};

export default HomeView;