#!/usr/bin/env node
process.stderr.write('sensitive diagnostic\n');
process.exitCode = 1;
