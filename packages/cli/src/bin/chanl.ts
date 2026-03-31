#!/usr/bin/env node

import 'dotenv/config';
import { createProgram } from '../index';

const program = createProgram();
program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
