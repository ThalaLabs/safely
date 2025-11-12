import React from 'react';
import { Box, Text } from 'ink';
import AddressLink from './AddressLink.js';
import { safeStringify } from '../utils.js';

interface PayloadRendererProps {
  payload: unknown;
  network: string;
  indent?: number;
}

/**
 * Renders a line of JSON with addresses converted to clickable links
 */
function renderLineWithAddressLinks(line: string, network: string, lineIndex: number) {
  // Pattern to match Aptos addresses (0x followed by up to 64 hex chars)
  const addressPattern = /(0x[0-9a-fA-F]{1,64})/g;

  // Split line into parts, alternating between non-address and address
  const parts = line.split(addressPattern);

  if (parts.length === 1) {
    // No addresses found, return plain text
    return <Text key={lineIndex}>{line}</Text>;
  }

  // Render parts with addresses as links
  return (
    <Text key={lineIndex}>
      {parts.map((part, i) => {
        // Even indices are non-address text, odd indices are addresses
        if (i % 2 === 0) {
          return part;
        } else {
          // Check if it looks like a valid address (not just any hex string)
          // Addresses are typically 64 chars or common short ones like 0x1
          const cleanAddr = part.slice(2);
          if ((cleanAddr.length >= 60 && cleanAddr.length <= 64) || cleanAddr.length <= 2) {
            return <AddressLink key={i} address={part} network={network} truncate={false} />;
          }
          // Not an address, just a hex value
          return part;
        }
      })}
    </Text>
  );
}

/**
 * Simple component to render a payload with address links
 * Uses safeStringify to format the JSON, then makes addresses clickable
 */
const PayloadRenderer: React.FC<PayloadRendererProps> = ({ payload, network, indent = 2 }) => {
  // Convert to formatted JSON using existing utility
  const jsonString = safeStringify(payload, indent);

  // Split into lines and render each with address detection
  const lines = jsonString.split('\n');

  return (
    <Box flexDirection="column">
      {lines.map((line, index) => renderLineWithAddressLinks(line, network, index))}
    </Box>
  );
};

export default PayloadRenderer;
