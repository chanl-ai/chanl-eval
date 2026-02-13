import { Command } from 'commander';
import { loadConfig, saveConfig } from '../config';
import { printSuccess } from '../output';

export function registerAnalyticsCommand(program: Command): void {
  const analytics = program
    .command('analytics')
    .description('Manage anonymous usage analytics');

  analytics
    .command('status')
    .description('Show analytics status')
    .action(() => {
      const config = loadConfig();
      const enabled = config.analytics !== false;
      console.log(`Analytics: ${enabled ? 'enabled' : 'disabled'}`);
      if (config.analyticsId) {
        console.log(`Anonymous ID: ${config.analyticsId}`);
      }
      console.log('');
      console.log(
        'chanl collects anonymous usage data to improve the tool.',
      );
      console.log(
        'No API keys, transcripts, or personal data is ever collected.',
      );
      console.log('Learn more: https://chanl.ai/telemetry');
    });

  analytics
    .command('enable')
    .description('Enable anonymous analytics')
    .action(() => {
      const config = loadConfig();
      config.analytics = true;
      saveConfig(config);
      printSuccess('Analytics enabled');
    });

  analytics
    .command('disable')
    .description('Disable anonymous analytics')
    .action(() => {
      const config = loadConfig();
      config.analytics = false;
      saveConfig(config);
      printSuccess('Analytics disabled');
    });
}
