import { closeDatabase } from '../src/db/client';
import { verifyLedgerIntegrity } from '../src/services/ledger';

/**
 * Operational check: re-derives every wallet balance from the ledger and
 * reports any drift. Intended to run on a schedule in production; a non-zero
 * exit means a balance no longer matches the entries that produced it.
 */
async function main(): Promise<void> {
  const results = await verifyLedgerIntegrity();
  const broken = results.filter((result) => !result.consistent);

  console.log(`Checked ${results.length} wallet(s).`);

  if (broken.length === 0) {
    console.log('Ledger is consistent.');
    return;
  }

  console.error(`${broken.length} inconsistent wallet(s):`);
  for (const row of broken) {
    console.error(
      `  wallet=${row.walletId} user=${row.userId} ` +
        `balance=${row.materialisedBalance} derived=${row.derivedBalance} ` +
        `entries=${row.materialisedEntryCount} derivedEntries=${row.derivedEntryCount}`,
    );
  }
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Integrity check failed:', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
