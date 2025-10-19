import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Box, Text, useInput, useApp, render } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { ProfileDefault, MultisigDefault, NetworkDefault, MultisigHistory } from '../storage.js';
import { getAllProfiles, ProfileInfo } from '../profiles.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { validateAddress } from '../validators.js';
import ProposalView from './ProposalView.js';
import SharedHeader from './SharedHeader.js';
import { initAptos, getFullnodeUrl } from '../utils.js';
import { AccountAddress } from '@aptos-labs/ts-sdk';
import { loadProfile } from '../profiles.js';
import AddressLink from './AddressLink.js';

interface HomeViewProps {
  onNavigate?: (view: 'proposal') => void;
}

interface Config {
  network?: NetworkChoice;
  multisig?: string;
  profile?: string;
  profiles: ProfileInfo[];
  multisigOwners: string[];
  profileAddress: string | null;
  multisigHistory: string[];
  rpcEndpoint?: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<Config>({
    profiles: [],
    multisigOwners: [],
    profileAddress: null,
    multisigHistory: []
  });
  const [menu, setMenu] = useState<MenuState>({
    selectedIndex: 0,
    expandedItem: null,
    subIndex: 0,
    multisigInput: '',
    multisigError: '',
    isValidating: false
  });

  // Load configuration
  useEffect(() => {
    const load = async () => {
      const [network, multisig, profile] = await Promise.all([
        NetworkDefault.get(),
        MultisigDefault.get(),
        ProfileDefault.get()
      ]);
      const owners = network && multisig ? await fetchMultisigOwners(network, multisig) : [];
      const multisigHistory = network ? await MultisigHistory.getForNetwork(network) : [];
      setConfig({
        network,
        multisig,
        profile,
        profiles: getAllProfiles(),
        multisigOwners: owners,
        profileAddress: null,
        multisigHistory
      });
      setIsLoading(false);
    };
    load();
  }, []);

  // Fetch multisig owners from chain
  const fetchMultisigOwners = useCallback(async (network: NetworkChoice, multisigAddress: string): Promise<string[]> => {
    try {
      const aptos = initAptos(network);
      const resource = await aptos.getAccountResource<MultisigResource>({
        accountAddress: multisigAddress,
        resourceType: '0x1::multisig_account::MultisigAccount'
      });
      return resource.owners || [];
    } catch {
      return [];
    }
  }, []);

  // Load profile address and RPC endpoint
  useEffect(() => {
    const loadProfileAddress = async () => {
      const network = config.network;
      if (config.profile && network) {
        try {
          const profile = await loadProfile(config.profile, network);
          setConfig(prev => ({
            ...prev,
            profileAddress: profile.signer.accountAddress.toString(),
            // Always use actual RPC URL - either custom or default
            rpcEndpoint: profile.fullnode || getFullnodeUrl(network)
          }));
        } catch {
          setConfig(prev => ({
            ...prev,
            profileAddress: null,
            // Even without profile, show default RPC if network is set
            rpcEndpoint: getFullnodeUrl(network)
          }));
        }
      } else if (network) {
        setConfig(prev => ({
          ...prev,
          profileAddress: null,
          // Even without profile, show default RPC if network is set
          rpcEndpoint: getFullnodeUrl(network)
        }));
      } else {
        setConfig(prev => ({
          ...prev,
          profileAddress: null,
          rpcEndpoint: undefined
        }));
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
    if (!config.profileAddress || config.multisigOwners.length === 0) return false;
    try {
      const profileAddr = AccountAddress.from(config.profileAddress);
      return config.multisigOwners.some(owner => {
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
  }, [config.profileAddress, config.multisigOwners]);

  const canAccessProposals = !!(
    config.network &&
    config.multisig
  );

  const networks = NETWORK_CHOICES;

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
      newConfig.multisigOwners = [];
      newConfig.profileAddress = null;
      // Load multisig history for new network
      const multisigHistory = await MultisigHistory.getForNetwork(updates.network);
      newConfig.multisigHistory = multisigHistory;
    }
    if ('multisig' in updates && updates.multisig) {
      await MultisigDefault.set(updates.multisig);
      // Fetch owners for new multisig
      if (config.network) {
        const owners = await fetchMultisigOwners(config.network, updates.multisig);
        newConfig.multisigOwners = owners;
        // Add to history
        await MultisigHistory.add(config.network, updates.multisig);
        // Refresh history
        const multisigHistory = await MultisigHistory.getForNetwork(config.network);
        newConfig.multisigHistory = multisigHistory;
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
      const idx = config.network
        ? networks.indexOf(config.network as any)
        : -1;
      updates.subIndex = Math.max(0, idx);
    } else if (item === 'profile') {
      const idx = filteredProfiles.findIndex(p => p.name === config.profile);
      updates.subIndex = Math.max(0, idx);
    } else if (item === 'multisig') {
      updates.multisigInput = '';
      updates.isValidating = false;
      updates.multisigError = '';
      // Start with input field selected (subIndex = history.length means input field)
      updates.subIndex = config.multisigHistory.length;
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
        // Allow navigating to "Skip" option (one past the last profile)
        setMenu(m => ({ ...m, subIndex: Math.min(filteredProfiles.length, m.subIndex + 1) }));
      } else if (key.return) {
        if (subIndex === filteredProfiles.length) {
          // "Skip" option selected - clear profile for read-only mode
          updateConfig({ profile: undefined });
          collapseMenu();
        } else if (filteredProfiles[subIndex]) {
          // Profile selected
          updateConfig({ profile: filteredProfiles[subIndex].name });
          collapseMenu();
        }
      }
    } else if (expandedItem === 'multisig') {
      if (key.escape) {
        collapseMenu();
      } else if (key.upArrow) {
        setMenu(m => ({ ...m, subIndex: Math.max(0, m.subIndex - 1) }));
      } else if (key.downArrow) {
        setMenu(m => ({ ...m, subIndex: Math.min(config.multisigHistory.length, m.subIndex + 1) }));
      } else if (key.return) {
        // If on input field (subIndex == history.length), validate and save
        if (subIndex === config.multisigHistory.length) {
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
                await updateConfig({ multisig: menu.multisigInput, multisigOwners: resource.owners });
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
        } else if (config.multisigHistory[subIndex]) {
          // Select from history
          updateConfig({ multisig: config.multisigHistory[subIndex] });
          collapseMenu();
        }
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
  if (view === 'proposal' && canAccessProposals) {
    return (
      <ProposalView
        profile={config.profile}
        multisigAddress={config.multisig!}
        network={config.network!}
        rpcEndpoint={config.rpcEndpoint}
        onBack={() => setView('home')}
      />
    );
  }

  const { selectedIndex, expandedItem, subIndex, multisigInput, multisigError } = menu;

  return (
    <Box flexDirection="column">
      <SharedHeader
        network={config.network}
        profile={config.profile}
        multisig={config.multisig}
        rpcEndpoint={config.rpcEndpoint}
        isLoading={isLoading}
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
              multisigHistory={config.multisigHistory}
              currentMultisig={config.multisig}
              subIndex={subIndex}
              network={config.network}
            />
          ) : (
            <MenuItem
              isSelected={selectedIndex === 1}
              label="Multisig"
              value={config.multisig}
              placeholder={!config.network ? "(Select network first)" : "(Enter address)"}
              disabled={!config.network}
              network={config.network}
              isAddress={true}
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
                config.profile === undefined && config.network && config.multisig
                  ? 'Read-only'
                  : filteredProfiles.some(p => p.name === config.profile)
                  ? `${config.profile}${!isProfileOwner ? ' (non-owner)' : ''}`
                  : undefined
              }
              placeholder={
                !config.network ? "(Select network first)" :
                filteredProfiles.length === 0 ? `(No profiles for ${config.network})` :
                "(Select profile or skip)"
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
  network?: string;
  isAddress?: boolean;
}> = ({ isSelected, label, value, placeholder, showCheck, warning, network, isAddress }) => (
  <Text>
    {isSelected ? '▶' : ' '} {label}: {
      showCheck ? <Text color="green">✓</Text> :
      value ? (
        warning ? (
          <><Text color="yellow">{value}</Text> <Text color="yellow">⚠</Text></>
        ) : isAddress && network ? (
          <><AddressLink address={value} network={network} truncate={true} /> <Text color="green">✓</Text></>
        ) : (
          <Text color="cyan">{value} ✓</Text>
        )
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
  multisigHistory: string[];
  currentMultisig?: string;
  subIndex: number;
  network?: string;
}> = ({ input, error, isSelected, isValidating, onInputChange, multisigHistory, currentMultisig, subIndex, network }) => {
  const isInputSelected = subIndex === multisigHistory.length;

  return (
    <>
      <Text>{isSelected ? '▼' : ' '} Multisig:</Text>
      {multisigHistory.map((address, index) => (
        <Text key={address}>
          {'  '}{index === subIndex ? '▶' : ' '} {network ? <AddressLink address={address} network={network} truncate={true} /> : `${address.slice(0, 10)}...${address.slice(-6)}`}
          {address === currentMultisig && <Text color="green"> ✓</Text>}
        </Text>
      ))}
      <Box paddingLeft={2}>
        <Text>{isInputSelected ? '▶' : ' '} New: </Text>
        {isValidating ? (
          <Text color="cyan">
            <Spinner type="dots" /> Validating...
          </Text>
        ) : (
          <TextInput
            value={input}
            onChange={onInputChange}
            placeholder="0x..."
            focus={isInputSelected}
          />
        )}
      </Box>
      {error && <Text color="red">  ✗ {error}</Text>}
    </>
  );
};

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
      <>
        {profiles.map((profile, index) => (
          <Text key={profile.name}>
            {'  '}{index === subIndex ? '▶' : ' '} {profile.name}
            {profile.name === currentProfile && <Text color="green"> ✓</Text>}
          </Text>
        ))}
        <Text>
          {'  '}{subIndex === profiles.length ? '▶' : ' '} <Text dimColor>Skip (read-only)</Text>
          {currentProfile === undefined && <Text color="green"> ✓</Text>}
        </Text>
      </>
    ) : (
      <>
        <Text dimColor>  No profiles found for {network}</Text>
        <Text>
          {'  '}{subIndex === 0 ? '▶' : ' '} <Text dimColor>Skip (read-only)</Text>
          {currentProfile === undefined && <Text color="green"> ✓</Text>}
        </Text>
      </>
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