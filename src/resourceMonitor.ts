import { WriteSetChange } from '@aptos-labs/ts-sdk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { input } from '@inquirer/prompts';
import { isWriteSetChangeWriteResource } from './utils.js';

export interface MonitoredResourceChange {
  resourceId: string;
  address: string;
  resourceType: string;
  data: unknown;
}

// Monitored resources file: ~/.safely/monitored-resources.txt
const MONITORED_RESOURCES_FILE = path.join(os.homedir(), '.safely', 'monitored-resources.txt');

/**
 * Load monitored resource IDs from the text file
 * Returns an empty array if the file doesn't exist or can't be read
 * Each line in the file is treated as a resource ID (empty lines and lines starting with # are ignored)
 */
export function loadMonitoredResources(): string[] {
  if (!fs.existsSync(MONITORED_RESOURCES_FILE)) {
    return [];
  }

  try {
    const data = fs.readFileSync(MONITORED_RESOURCES_FILE, 'utf8');
    const lines = data.split('\n');
    
    return lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#')); // Ignore empty lines and comments
  } catch (error) {
    console.warn(`Warning: Could not read monitored resources file: ${error}`);
    return [];
  }
}

/**
 * Get the path to the monitored resources file
 * Useful for displaying to users where they can edit the file
 */
export function getMonitoredResourcesFilePath(): string {
  return MONITORED_RESOURCES_FILE;
}

/**
 * Get detailed information about monitored resource changes
 * Returns an array of MonitoredResourceChange objects with address, type, and data
 */
export function getMonitoredResourceChanges(changes: WriteSetChange[]): MonitoredResourceChange[] {
  const monitoredResources = loadMonitoredResources();
  if (monitoredResources.length === 0) {
    return [];
  }

  const resourceChanges = changes.filter(isWriteSetChangeWriteResource);
  const monitoredChanges: MonitoredResourceChange[] = [];

  for (const change of resourceChanges) {
    const resourceType = change.data.type;
    // Check if the resource type matches any monitored resource
    for (const monitoredId of monitoredResources) {
      if (resourceType === monitoredId || resourceType.includes(monitoredId)) {
        // Check if we've already added this resource change
        const alreadyAdded = monitoredChanges.some(
          (mc) => mc.address === change.address && mc.resourceType === resourceType
        );
        
        if (!alreadyAdded) {
          monitoredChanges.push({
            resourceId: monitoredId,
            address: change.address,
            resourceType: resourceType,
            data: change.data.data,
          });
        }
      }
    }
  }

  return monitoredChanges;
}

/**
 * Prompt user for confirmation when affected resources are detected
 * Throws an error if confirmation fails or is cancelled
 */
export async function confirmAffectedResources(affectedResources: MonitoredResourceChange[]): Promise<void> {
  if (affectedResources.length === 0) {
    return;
  }

  // For each affected resource, prompt for confirmation
  for (const change of affectedResources) {
    console.log(
      chalk.yellow(
        `⚠️  WARNING: This transaction affects monitored resource ${change.resourceId}.`
      )
    );
    
    try {
      const confirmation = await input({
        message: `If this is acceptable, please enter ${change.resourceId} as confirmation:`,
      });

      if (confirmation !== change.resourceId) {
        throw new Error(
          `Confirmation failed. Expected "${change.resourceId}" but got "${confirmation}". Transaction proposal cancelled.`
        );
      }
    } catch (error) {
      // If user cancels (Ctrl+C), re-throw as cancellation error
      if ((error as Error).message.includes('User force closed')) {
        throw new Error('Transaction proposal cancelled by user.');
      }
      throw error;
    }
  }
}

