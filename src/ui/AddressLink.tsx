import React from 'react';
import { Text } from 'ink';
import Link from 'ink-link';
import { NetworkChoice } from '../constants.js';
import { getAddressLabel } from '../labelConfig.js';
import { getExplorerUrl } from '../utils.js';

// Helper function to truncate address uniformly
function truncateAddress(address: string): string {
  if (address.length > 10) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return address;
}

export interface AddressLinkProps {
  address: string;
  network: string;
  color?: string;
  truncate?: boolean; // Whether to truncate the address (default: true)
}

const AddressLink: React.FC<AddressLinkProps> = React.memo(
  ({ address, network, color, truncate = true }) => {
    const url = getExplorerUrl(network as NetworkChoice, `account/${address}`);
    const label = getAddressLabel(address, network as NetworkChoice);

    let displayText: string;
    if (label) {
      // If there's a label, show: "Label (0x1234...5678)"
      const addr = truncate ? truncateAddress(address) : address;
      displayText = `${label} (${addr})`;
    } else {
      // No label, show address only
      displayText = truncate ? truncateAddress(address) : address;
    }

    return (
      <Link url={url}>
        <Text color={color}>{displayText}</Text>
      </Link>
    );
  }
);

export default AddressLink;
