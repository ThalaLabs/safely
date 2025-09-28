import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { ProfileDefault, MultisigDefault, NetworkDefault } from '../storage.js';
import { getAllProfiles, ProfileInfo } from '../profiles.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { validateAddress } from '../validators.js';
import ProposalView from './ProposalView.js';
import SharedHeader from './SharedHeader.js';
import { initAptos } from '../utils.js';
import { AccountAddress } from '@aptos-labs/ts-sdk';
import { loadProfile } from '../signing.js';

interface HomeViewProps {
  onNavigate?: (view: 'proposal') => void;
}

interface Config {
  network?: NetworkChoice;
  multisig?: string;
  profile?: string;
  profiles: ProfileInfo[];
}

interface MenuState {
  selectedIndex: number;
  expandedItem: string | null;
  subIndex: number;
  multisigInput: string;
  multisigError: string;
  isValidating: boolean;
}

interface MultisigResource {
  owners: string[];
}

const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const { exit } = useApp();
  const [view, setView] = useState<'home' | 'proposal'>('home');
  const [config, setConfig] = useState<Config>({ profiles: [] });
  const [menu, setMenu] = useState<MenuState>({
    selectedIndex: 0,
    expandedItem: null,
    subIndex: 0,
    multisigInput: '',
    multisigError: '',
    isValidating: false
  });
  const [multisigOwners, setMultisigOwners] = useState<string[]>([]);
  const [profileAddress, setProfileAddress] = useState<string | null>(null);

  // Load configuration
  useEffect(() => {
    const load = async () => {
      const [network, multisig, profile] = await Promise.all([
        NetworkDefault.get(),
        MultisigDefault.get(),
        ProfileDefault.get()
      ]);
      setConfig({
        network,
        multisig,
        profile,
        profiles: getAllProfiles()
      });
      // Load multisig owners if we have a multisig
      if (network && multisig) {
        await fetchMultisigOwners(network, multisig);
      }
    };
    load();
  }, []);

  // Fetch multisig owners from chain
  const fetchMultisigOwners = useCallback(async (network: NetworkChoice, multisigAddress: string) => {
    try {
      const aptos = initAptos(network);
      const resource = await aptos.getAccountResource<MultisigResource>({
        accountAddress: multisigAddress,
        resourceType: '0x1::multisig_account::MultisigAccount'
      });
      setMultisigOwners(resource.owners || []);
    } catch {
      setMultisigOwners([]);
    }
  }, []);

  // Load profile address
  useEffect(() => {
    const loadProfileAddress = async () => {
      if (config.profile && config.network) {
        try {
          const profile = await loadProfile(config.profile, config.network, true);
          setProfileAddress(profile.signer.accountAddress.toString());
        } catch {
          setProfileAddress(null);
        }
      } else {
        setProfileAddress(null);
      }
    };
    loadProfileAddress();
  }, [config.profile, config.network]);

  // Derived state
  const filteredProfiles = config.network
    ? config.profiles.filter(p => p.network === config.network)
    : [];

  // Check if profile is an owner
  const isProfileOwner = useMemo(() => {
    if (!profileAddress || multisigOwners.length === 0) return false;
    try {
      const profileAddr = AccountAddress.from(profileAddress);
      return multisigOwners.some(owner => {
        try {
          const ownerAddr = AccountAddress.from(owner);
          return ownerAddr.equals(profileAddr);
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }, [profileAddress, multisigOwners]);

  const canAccessProposals = !!(
    config.network &&
    config.multisig &&
    config.profile &&
    filteredProfiles.some(p => p.name === config.profile)
  );

  const networks = NETWORK_CHOICES.filter(n => n !== 'custom');

  // Menu actions
  const updateConfig = useCallback(async (updates: Partial<Config>) => {
    const newConfig = { ...config, ...updates };

    // Save to storage
    if ('network' in updates && updates.network) {
      await NetworkDefault.set(updates.network);
      // Clear both multisig and profile when network changes
      await MultisigDefault.remove();
      await ProfileDefault.remove();
      newConfig.multisig = undefined;
      newConfig.profile = undefined;
      // Clear multisig owners when network changes
      setMultisigOwners([]);
    }
    if ('multisig' in updates && updates.multisig) {
      await MultisigDefault.set(updates.multisig);
      // Fetch owners for new multisig
      if (config.network) {
        await fetchMultisigOwners(config.network, updates.multisig);
      }
    }
    if ('profile' in updates && updates.profile) {
      await ProfileDefault.set(updates.profile);
    }

    setConfig(newConfig);
  }, [config, fetchMultisigOwners]);

  const collapseMenu = () => setMenu(m => ({
    ...m,
    expandedItem: null,
    subIndex: 0,
    multisigInput: '',
    multisigError: ''
  }));

  const expandMenuItem = (item: string) => {
    const updates: Partial<MenuState> = { expandedItem: item };

    if (item === 'network') {
      const idx = config.network && config.network !== 'custom'
        ? networks.indexOf(config.network as any)
        : -1;
      updates.subIndex = Math.max(0, idx);
    } else if (item === 'profile') {
      const idx = filteredProfiles.findIndex(p => p.name === config.profile);
      updates.subIndex = Math.max(0, idx);
    } else if (item === 'multisig') {
      updates.multisigInput = config.multisig || '';
    }

    setMenu(m => ({ ...m, ...updates }));
  };

  // Input handlers
  useInput((input, key) => {
    if (view === 'proposal') return;

    const { expandedItem, selectedIndex, subIndex } = menu;

    // Global quit
    if (input?.toLowerCase() === 'q') {
      exit();
      return;
    }

    // Handle expanded items
    if (expandedItem === 'network') {
      if (key.escape) {
        collapseMenu();
      } else if (key.upArrow) {
        setMenu(m => ({ ...m, subIndex: Math.max(0, m.subIndex - 1) }));
      } else if (key.downArrow) {
        setMenu(m => ({ ...m, subIndex: Math.min(networks.length - 1, m.subIndex + 1) }));
      } else if (key.return) {
        updateConfig({ network: networks[subIndex] as NetworkChoice });
        collapseMenu();
      }
    } else if (expandedItem === 'profile') {
      if (key.escape) {
        collapseMenu();
      } else if (key.upArrow) {
        setMenu(m => ({ ...m, subIndex: Math.max(0, m.subIndex - 1) }));
      } else if (key.downArrow) {
        setMenu(m => ({ ...m, subIndex: Math.min(filteredProfiles.length - 1, m.subIndex + 1) }));
      } else if (key.return && filteredProfiles[subIndex]) {
        updateConfig({ profile: filteredProfiles[subIndex].name });
        collapseMenu();
      }
    } else if (expandedItem === 'multisig') {
      if (key.escape) {
        collapseMenu();
      } else if (key.return) {
        // Validate and save multisig address
        (async () => {
          try {
            validateAddress(menu.multisigInput);
            setMenu(m => ({ ...m, isValidating: true, multisigError: '' }));

            // Check if address has MultisigAccount resource
            const aptos = initAptos(config.network!);
            try {
              const resource = await aptos.getAccountResource<MultisigResource>({
                accountAddress: menu.multisigInput,
                resourceType: '0x1::multisig_account::MultisigAccount'
              });
              // Successfully got the resource, it's a valid multisig
              setMultisigOwners(resource.owners || []);
              await updateConfig({ multisig: menu.multisigInput });
              collapseMenu();
            } catch (resourceError) {
              // Resource doesn't exist or error fetching
              setMenu(m => ({
                ...m,
                multisigError: 'Address is not a multisig account',
                isValidating: false
              }));
            }
          } catch (error) {
            setMenu(m => ({
              ...m,
              multisigError: String(error).replace('Error: ', ''),
              isValidating: false
            }));
          }
        })();
      }
    } else {
      // Main menu navigation
      if (key.upArrow) {
        setMenu(m => ({ ...m, selectedIndex: Math.max(0, m.selectedIndex - 1) }));
      } else if (key.downArrow) {
        setMenu(m => ({ ...m, selectedIndex: Math.min(3, m.selectedIndex + 1) }));
      } else if (key.return) {
        const items = ['network', 'multisig', 'profile', 'proposals'];
        const selected = items[selectedIndex];

        if (selected === 'proposals' && canAccessProposals) {
          setView('proposal');
          onNavigate?.('proposal');
        } else if (selected === 'network') {
          expandMenuItem('network');
        } else if (selected === 'multisig' && config.network) {
          expandMenuItem('multisig');
        } else if (selected === 'profile' && config.network) {
          expandMenuItem('profile');
        }
      }
    }
  });

  // Show proposal view
  if (view === 'proposal' && canAccessProposals && config.network) {
    return (
      <ProposalView
        profile={config.profile!}
        multisigAddress={config.multisig!}
        network={config.network}
        onBack={() => setView('home')}
      />
    );
  }

  const { selectedIndex, expandedItem, subIndex, multisigInput, multisigError } = menu;

  return (
    <Box flexDirection="column">
      <SharedHeader
        subtitle="Main Menu"
        network={config.network}
        profile={config.profile}
        multisig={config.multisig}
      />

      <Box borderStyle="single" paddingX={1}>
        <Box flexDirection="column">
          {/* Network */}
          {expandedItem === 'network' ? (
            <NetworkExpanded
              networks={networks}
              currentNetwork={config.network}
              subIndex={subIndex}
              isSelected={selectedIndex === 0}
            />
          ) : (
            <MenuItem
              isSelected={selectedIndex === 0}
              label="Network"
              value={config.network}
              placeholder="(Select network)"
            />
          )}

          {/* Multisig */}
          {expandedItem === 'multisig' ? (
            <MultisigExpanded
              input={multisigInput}
              error={multisigError}
              isSelected={selectedIndex === 1}
              isValidating={menu.isValidating}
              onInputChange={value => setMenu(m => ({ ...m, multisigInput: value }))}
            />
          ) : (
            <MenuItem
              isSelected={selectedIndex === 1}
              label="Multisig"
              value={config.multisig ? `${config.multisig.slice(0, 10)}...` : undefined}
              placeholder={!config.network ? "(Select network first)" : "(Enter address)"}
              disabled={!config.network}
            />
          )}

          {/* Profile */}
          {expandedItem === 'profile' ? (
            <ProfileExpanded
              profiles={filteredProfiles}
              currentProfile={config.profile}
              network={config.network}
              subIndex={subIndex}
              isSelected={selectedIndex === 2}
            />
          ) : (
            <MenuItem
              isSelected={selectedIndex === 2}
              label="Profile"
              value={
                filteredProfiles.some(p => p.name === config.profile)
                  ? `${config.profile}${!isProfileOwner ? ' (non-owner)' : ''}`
                  : undefined
              }
              placeholder={
                !config.network ? "(Select network first)" :
                filteredProfiles.length === 0 ? `(No profiles for ${config.network})` :
                "(Select profile)"
              }
              disabled={!config.network}
              warning={!!config.profile && !isProfileOwner}
            />
          )}

          {/* Proposals */}
          <MenuItem
            isSelected={selectedIndex === 3}
            label="Proposals"
            value={canAccessProposals ? "" : undefined}
            placeholder={canAccessProposals ? undefined : "(Configure above first)"}
            showCheck={canAccessProposals ? true : undefined}
          />
        </Box>
      </Box>

      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          {expandedItem
            ? '[↑/↓] Navigate | [Enter] Select | [Esc] Back | [Q]uit'
            : '[↑/↓] Navigate | [Enter] Select/Expand | [Q]uit'}
        </Text>
      </Box>
    </Box>
  );
};

// Component: Menu Item
const MenuItem: React.FC<{
  isSelected: boolean;
  label: string;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  showCheck?: boolean;
  warning?: boolean;
}> = ({ isSelected, label, value, placeholder, showCheck, warning }) => (
  <Text>
    {isSelected ? '▶' : ' '} {label}: {
      showCheck ? <Text color="green">✓</Text> :
      value ? (
        warning ?
          <><Text color="yellow">{value}</Text> <Text color="yellow">⚠</Text></> :
          <Text color="cyan">{value} ✓</Text>
      ) :
      placeholder ? <Text dimColor>{placeholder}</Text> :
      null
    }
  </Text>
);

// Component: Network Expanded
const NetworkExpanded: React.FC<{
  networks: readonly string[];
  currentNetwork?: NetworkChoice;
  subIndex: number;
  isSelected: boolean;
}> = ({ networks, currentNetwork, subIndex, isSelected }) => (
  <>
    <Text>{isSelected ? '▼' : ' '} Network:</Text>
    {networks.map((network, index) => (
      <Text key={network}>
        {'  '}{index === subIndex ? '▶' : ' '} {network}
        {network === currentNetwork && <Text color="green"> ✓</Text>}
      </Text>
    ))}
  </>
);

// Component: Multisig Expanded
const MultisigExpanded: React.FC<{
  input: string;
  error: string;
  isSelected: boolean;
  isValidating: boolean;
  onInputChange: (value: string) => void;
}> = ({ input, error, isSelected, isValidating, onInputChange }) => (
  <>
    <Text>{isSelected ? '▼' : ' '} Multisig:</Text>
    <Box paddingLeft={2}>
      <Text>Address: </Text>
      {isValidating ? (
        <Text color="cyan">
          <Spinner type="dots" /> Validating...
        </Text>
      ) : (
        <TextInput
          value={input}
          onChange={onInputChange}
          placeholder="0x..."
        />
      )}
    </Box>
    {error && <Text color="red">  ✗ {error}</Text>}
    {!isValidating && <Text dimColor>  [Enter] Save | [Esc] Cancel</Text>}
  </>
);

// Component: Profile Expanded
const ProfileExpanded: React.FC<{
  profiles: ProfileInfo[];
  currentProfile?: string;
  network?: NetworkChoice;
  subIndex: number;
  isSelected: boolean;
}> = ({ profiles, currentProfile, network, subIndex, isSelected }) => (
  <>
    <Text>{isSelected ? '▼' : ' '} Profile:</Text>
    {profiles.length > 0 ? (
      profiles.map((profile, index) => (
        <Text key={profile.name}>
          {'  '}{index === subIndex ? '▶' : ' '} {profile.name}
          {profile.name === currentProfile && <Text color="green"> ✓</Text>}
        </Text>
      ))
    ) : (
      <Text dimColor>  No profiles found for {network}</Text>
    )}
  </>
);

export const runHomeView = () => {
  if (!process.stdin.isTTY) {
    console.error('Error: This command requires an interactive terminal (TTY).');
    console.error('Please run this command in an interactive terminal.');
    process.exit(1);
  }

  process.stdin.setRawMode(true);

  render(<HomeView />, {
    exitOnCtrlC: false
  });
};

export default HomeView;