import { runSeed } from '../src/cli/seed';

runSeed().catch((e) => {
  console.error(e);
  process.exit(1);
});
