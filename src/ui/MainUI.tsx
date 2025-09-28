import React, { useState } from 'react';
import { render } from 'ink';
import HomeView from './HomeView.js';
import ProfileView from './ProfileView.js';
import MultisigView from './MultisigView.js';
import { runProposalView } from './ProposalView.js';
import { ProfileDefault, MultisigDefault } from '../storage.js';

type View = 'home' | 'profile' | 'multisig' | 'proposal';

const MainUI: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');

  const handleNavigation = (view: View) => {
    setCurrentView(view);
  };

  const handleBack = () => {
    setCurrentView('home');
  };

  const handleProposalNavigation = async () => {
    // Get stored defaults
    const profile = await ProfileDefault.get();
    const multisigConfig = await MultisigDefault.getConfig();

    if (!profile || !multisigConfig) {
      console.error('Profile and multisig must be configured first');
      return;
    }

    // Exit the Ink app and launch ProposalView separately
    // This is needed because ProposalView has its own render call
    process.exit(0);

    // This won't actually run due to exit, but shows the intent
    runProposalView({
      profile: profile!,
      multisigAddress: multisigConfig!.address,
      network: multisigConfig!.network,
      onBack: handleBack
    });
  };

  switch (currentView) {
    case 'home':
      return <HomeView onNavigate={(view) => {
        if (view === 'proposal') {
          handleProposalNavigation();
        } else {
          handleNavigation(view);
        }
      }} />;
    case 'profile':
      return <ProfileView onBack={handleBack} />;
    case 'multisig':
      return <MultisigView onBack={handleBack} />;
    default:
      return <HomeView onNavigate={handleNavigation} />;
  }
};

export const runMainUI = async () => {
  // Check if TTY is available
  if (!process.stdin.isTTY) {
    console.error('Error: This command requires an interactive terminal (TTY).');
    console.error('Please run this command in an interactive terminal.');
    process.exit(1);
  }

  // Check if we should go directly to proposals (if both profile and multisig are set)
  const profile = await ProfileDefault.get();
  const multisigConfig = await MultisigDefault.getConfig();
  const { checkNetworkCompatibility } = await import('../storage.js');
  const compatibility = await checkNetworkCompatibility();

  // If everything is configured and compatible, we could offer a direct path to proposals
  // For now, always start at home for better UX

  // Enable raw mode for keyboard input
  process.stdin.setRawMode(true);

  render(<MainUI />, {
    exitOnCtrlC: false
  });
};

export default MainUI;