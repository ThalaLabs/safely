import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import chalk from 'chalk';
import { MultisigDefault, NetworkDefault } from '../storage.js';
import { NETWORK_CHOICES, NetworkChoice } from '../constants.js';
import { validateAddress } from '../validators.js';
import SharedHeader from './SharedHeader.js';

interface MultisigViewProps {
  onBack?: () => void;
}

type Step = 'network' | 'address' | 'confirm';

const MultisigView: React.FC<MultisigViewProps> = ({ onBack }) => {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('network');
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkChoice | null>(null);
  const [selectedNetworkIndex, setSelectedNetworkIndex] = useState(0);
  const [multisigAddress, setMultisigAddress] = useState('');
  const [currentDefaults, setCurrentDefaults] = useState<{ address?: string; network?: NetworkChoice }>({});
  const [message, setMessage] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  // Load current defaults
  useEffect(() => {
    const loadDefaults = async () => {
      const multisigConfig = await MultisigDefault.getConfig();
      if (multisigConfig) {
        setCurrentDefaults({
          address: multisigConfig.address,
          network: multisigConfig.network
        });
      }
    };

    loadDefaults();
  }, []);

  const handleSave = async () => {
    if (!selectedNetwork || !multisigAddress) {
      setMessage(chalk.red('✗ Network and address are required'));
      return;
    }

    try {
      await MultisigDefault.set(multisigAddress, selectedNetwork);
      await NetworkDefault.set(selectedNetwork);
      setMessage(chalk.green(`✓ Set multisig ${multisigAddress.slice(0, 10)}... on ${selectedNetwork}`));
      setTimeout(() => {
        if (onBack) {
          onBack();
        }
      }, 1500);
    } catch (error) {
      setMessage(chalk.red(`✗ Failed to save: ${error}`));
    }
  };

  const handleClear = async () => {
    try {
      await MultisigDefault.remove();
      setCurrentDefaults({});
      setMessage(chalk.yellow('✓ Cleared multisig defaults'));
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(chalk.red(`✗ Failed to clear: ${error}`));
    }
  };

  const validateAndProceed = () => {
    try {
      validateAddress(multisigAddress);
      setValidationError('');
      setStep('confirm');
    } catch (error) {
      setValidationError(String(error).replace('Error: ', ''));
    }
  };

  useInput((input, key) => {
    const normalizedInput = input?.toLowerCase?.() ?? '';

    // Clear message on any key press
    if (message && !['b', 'q'].includes(normalizedInput)) {
      setMessage('');
      return;
    }

    if (step === 'network') {
      if (key.upArrow) {
        setSelectedNetworkIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedNetworkIndex(prev => Math.min(NETWORK_CHOICES.length - 1, prev + 1));
      } else if (key.return) {
        setSelectedNetwork(NETWORK_CHOICES[selectedNetworkIndex] as NetworkChoice);
        setStep('address');
      } else if (normalizedInput === 'c') {
        handleClear();
      } else if (normalizedInput === 'b') {
        if (onBack) {
          onBack();
        } else {
          exit();
        }
      } else if (normalizedInput === 'q') {
        exit();
      }
    } else if (step === 'address') {
      if (key.return) {
        validateAndProceed();
      } else if (key.escape) {
        setStep('network');
        setValidationError('');
      }
    } else if (step === 'confirm') {
      if (normalizedInput === 'y') {
        handleSave();
      } else if (normalizedInput === 'n') {
        setStep('address');
      } else if (normalizedInput === 'b') {
        setStep('address');
      }
    }
  });

  return (
    <Box flexDirection="column">
      {/* Shared Header */}
      <SharedHeader subtitle="Multisig Management" />

      {/* Main Content */}
      <Box borderStyle="single" paddingX={1} minHeight={10}>
        <Box flexDirection="column">
          {step === 'network' && (
            <>
              <Text bold>Step 1: Select Network</Text>
              <Text dimColor>Choose the network where your multisig is deployed:</Text>
              <Text></Text>
              {NETWORK_CHOICES.filter(n => n !== 'custom').map((network, index) => {
                const isSelected = index === selectedNetworkIndex;
                return (
                  <Text key={network} inverse={isSelected}>
                    {isSelected ? '▶' : ' '} {network}
                    {currentDefaults.network === network && <Text color="green"> (current)</Text>}
                  </Text>
                );
              })}
            </>
          )}

          {step === 'address' && (
            <>
              <Text bold>Step 2: Enter Multisig Address</Text>
              <Text dimColor>Network: <Text color="cyan">{selectedNetwork}</Text></Text>
              <Text></Text>
              <Text>Address: </Text>
              <TextInput
                value={multisigAddress}
                onChange={setMultisigAddress}
                placeholder="0x..."
              />
              {validationError && (
                <Text color="red">✗ {validationError}</Text>
              )}
              <Text></Text>
              <Text dimColor>Enter a valid Aptos/Movement address (e.g., 0x1234...)</Text>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Text bold>Confirm Configuration</Text>
              <Text></Text>
              <Text>Network: <Text color="cyan">{selectedNetwork}</Text></Text>
              <Text>Address: <Text color="cyan">{multisigAddress}</Text></Text>
              <Text></Text>
              <Text color="yellow">Save this configuration as default? [Y/N]</Text>
            </>
          )}
        </Box>
      </Box>

      {/* Message */}
      {message && (
        <Box borderStyle="double" paddingX={1}>
          <Text>{message}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>
          {step === 'network' && '[↑/↓] Navigate | [Enter] Select | [C]lear defaults | [B]ack | [Q]uit'}
          {step === 'address' && '[Enter] Continue | [Esc] Back to network | [B]ack to home'}
          {step === 'confirm' && '[Y]es save | [N]o go back | [B]ack to address'}
        </Text>
      </Box>
    </Box>
  );
};

export default MultisigView;