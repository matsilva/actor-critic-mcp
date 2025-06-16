#!/usr/bin/env tsx

/**
 * Script to add use_voltagent feature flag to the configuration
 */

import { getConfig, updateFeatureFlag } from '../src/config/index.ts';
import { getInstance as getLogger } from '../src/logger.ts';

const logger = getLogger({ withDevStdout: true, sync: true });

async function addVoltAgentFlag() {
  try {
    logger.info('Adding use_voltagent feature flag to configuration...');
    
    const config = getConfig();
    
    // Log current config path
    logger.info(`Configuration path: ${config.path}`);
    logger.info(`Config store:`, config.store);
    
    // Check current feature flags
    const currentFlags = config.get('features');
    logger.info('Current feature flags:', currentFlags);
    
    // Update the flag
    updateFeatureFlag('use_voltagent', true);
    
    // Verify the update
    const updatedFlags = config.get('features');
    logger.info('Updated feature flags:', updatedFlags);
    
    logger.info('Successfully added use_voltagent=true feature flag');
  } catch (error) {
    logger.error('Failed to add feature flag:', error);
    process.exit(1);
  }
}

addVoltAgentFlag().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});