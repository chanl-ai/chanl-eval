import chalk from 'chalk';
import Table from 'cli-table3';

/**
 * Print data as a formatted table.
 */
export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({
    head: headers.map((h) => chalk.cyan(h)),
    style: {
      head: [],
      border: [],
    },
  });

  for (const row of rows) {
    table.push(row);
  }

  console.log(table.toString());
}

/**
 * Print data as formatted JSON.
 */
export function printJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print output based on the --format flag.
 * If format is 'json', prints JSON. Otherwise prints a table.
 */
export function printOutput(
  format: string | undefined,
  headers: string[],
  rows: string[][],
  data: any,
): void {
  if (format === 'json') {
    printJson(data);
  } else {
    printTable(headers, rows);
  }
}

/**
 * Print a success message.
 */
export function printSuccess(message: string): void {
  console.log(chalk.green('OK') + ' ' + message);
}

/**
 * Print an error message and exit.
 */
export function printError(message: string): void {
  console.error(chalk.red('Error:') + ' ' + message);
}

/**
 * Print a warning message.
 */
export function printWarning(message: string): void {
  console.log(chalk.yellow('Warning:') + ' ' + message);
}

/**
 * Truncate a string to a max length, adding ellipsis if needed.
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
