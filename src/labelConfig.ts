import { AccountAddress } from '@aptos-labs/ts-sdk';
import { NetworkChoice } from './constants.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Labels directory: ~/.safely/labels/
const LABELS_DIR = path.join(os.homedir(), '.safely', 'labels');

/**
 * Ensure the labels directory exists
 */
function ensureLabelsDir(): void {
  if (!fs.existsSync(LABELS_DIR)) {
    fs.mkdirSync(LABELS_DIR, { recursive: true });
  }
}

/**
 * Get the path to the label file for a specific network
 */
function getLabelFilePath(network: NetworkChoice): string {
  return path.join(LABELS_DIR, `${network}.json`);
}

/**
 * Load labels for a specific network
 * Returns an empty object if the file doesn't exist or can't be read
 */
export function loadLabels(network: NetworkChoice): Record<string, string> {
  ensureLabelsDir();

  const filePath = getLabelFilePath(network);

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn(`Warning: Could not read label file for ${network}: ${error}`);
    return {};
  }
}

/**
 * Save labels for a specific network
 * This completely replaces the existing labels
 */
export function saveLabels(network: NetworkChoice, labels: Record<string, string>): void {
  ensureLabelsDir();

  const filePath = getLabelFilePath(network);
  const tmpPath = `${filePath}.tmp`;

  try {
    fs.writeFileSync(tmpPath, JSON.stringify(labels, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw error;
  }
}

/**
 * Merge new labels into existing labels
 * New labels override existing ones for the same address
 */
export function mergeLabels(
  existing: Record<string, string>,
  newLabels: Record<string, string>
): Record<string, string> {
  return { ...existing, ...newLabels };
}

/**
 * Clear all labels for a specific network
 */
export function clearLabels(network: NetworkChoice): void {
  const filePath = getLabelFilePath(network);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Get the label for an address on a specific network
 * Returns undefined if no label is found
 */
export function getAddressLabel(address: string, network: NetworkChoice): string | undefined {
  if (!address) {
    return undefined;
  }

  try {
    const normalizedAddress = AccountAddress.from(address).toString();
    const labels = loadLabels(network);

    return labels[normalizedAddress];
  } catch {
    return undefined;
  }
}
