import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import chalk from 'chalk';
import { ProfileDefault, MultisigDefault, checkNetworkCompatibility } from '../storage.js';
import ProfileView from './ProfileView.js';
import MultisigView from './MultisigView.js';
import ProposalView from './ProposalView.js';
import SharedHeader from './SharedHeader.js';

interface HomeViewProps {
  onNavigate?: (view: 'profile' | 'multisig' | 'proposal') => void;
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentProfile, setCurrentProfile] = useState<string | undefined>();
  const [currentMultisig, setCurrentMultisig] = useState<{ address: string; network: string } | undefined>();
  const [networkMismatch, setNetworkMismatch] = useState(false);
  const [currentView, setCurrentView] = useState<'home' | 'profile' | 'multisig' | 'proposal'>('home');

  const menuItems = [
    { label: 'Profile Management', view: 'profile' as const },
    { label: 'Multisig Management', view: 'multisig' as const },
    { label: 'Proposals', view: 'proposal' as const },
  ];

  // Load current configuration
  useEffect(() => {
    const loadConfig = async () => {
      const profile = await ProfileDefault.get();
      const multisigConfig = await MultisigDefault.getConfig();
      const compatibility = await checkNetworkCompatibility();

      setCurrentProfile(profile);
      if (multisigConfig) {
        setCurrentMultisig({
          address: multisigConfig.address,
          network: multisigConfig.network
        });
      }
      setNetworkMismatch(profile && multisigConfig && !compatibility.compatible ? true : false);
    };

    loadConfig();
  }, [currentView]);

  // Check if proposals can be accessed
  const canAccessProposals = currentProfile && currentMultisig && !networkMismatch;

  useInput((input, key) => {
    const normalizedInput = input?.toLowerCase?.() ?? '';

    if (currentView !== 'home') {
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(prev => Math.max(0, prev - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => Math.min(menuItems.length - 1, prev + 1));
    } else if (key.return) {
      const selectedItem = menuItems[selectedIndex];
      if (selectedItem.view === 'proposal' && !canAccessProposals) {
        return; // Don't allow entering proposals if not configured
      }
      setCurrentView(selectedItem.view);
      if (onNavigate) {
        onNavigate(selectedItem.view);
      }
    } else if (normalizedInput === 'q') {
      exit();
    }
  });

  // Handle navigation from child views
  const handleBack = () => {
    setCurrentView('home');
  };

  // Render child views
  if (currentView === 'profile') {
    return <ProfileViewWrapper onBack={handleBack} />;
  }
  if (currentView === 'multisig') {
    return <MultisigViewWrapper onBack={handleBack} />;
  }
  if (currentView === 'proposal' && currentProfile && currentMultisig) {
    return <ProposalViewWrapper
      profile={currentProfile}
      multisigAddress={currentMultisig.address}
      network={currentMultisig.network}
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
          <Text bold>Main Menu:</Text>
          {menuItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            const isDisabled = item.view === 'proposal' && !canAccessProposals;

            return (
              <Text key={item.view} inverse={isSelected}>
                {isSelected ? '▶' : ' '} {item.label}
                {item.view === 'proposal' && !canAccessProposals && (
                  <Text dimColor> (Configure profile & multisig first)</Text>
                )}
                {item.view === 'proposal' && canAccessProposals && (
                  <Text color="green"> ✓</Text>
                )}
              </Text>
            );
          })}
        </Box>
      </Box>

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          [↑/↓] Navigate | [Enter] Select | [Q]uit
        </Text>
      </Box>
    </Box>
  );
};

// Wrapper components to handle child views
const ProfileViewWrapper: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return <ProfileView onBack={onBack} />;
};

const MultisigViewWrapper: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  return <MultisigView onBack={onBack} />;
};

const ProposalViewWrapper: React.FC<{
  profile: string;
  multisigAddress: string;
  network: string;
  onBack: () => void;
}> = ({ profile, multisigAddress, network, onBack }) => {
  return <ProposalView
    profile={profile}
    multisigAddress={multisigAddress}
    network={network}
    onBack={onBack}
  />;
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