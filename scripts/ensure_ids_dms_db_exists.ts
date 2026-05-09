import 'dotenv/config';
import {CreateDatabaseOperation, DocumentStore, GetDatabaseRecordOperation} from 'ravendb';
import {RAVENDB_ALIVE_URL} from './constants.js';

async function waitForRavenDb(url: string, maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/build/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // not ready yet
    }
    if (attempt === maxAttempts) {
      throw new Error(`RavenDB at ${url} did not respond after ${maxAttempts} attempts`);
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function ensureIdsDmsDatabase(): Promise<void> {
  const url = process.env.RAVENDB_URL || RAVENDB_ALIVE_URL;
  const database = process.env.RAVENDB_DATABASE || 'ids_dms';

  await waitForRavenDb(url);

  const store = new DocumentStore(url, database);
  store.initialize();

  try {
    const existingDatabaseRecord = await store.maintenance.server.send(
      new GetDatabaseRecordOperation(database),
    );

    if (existingDatabaseRecord) {
      console.log(`RavenDB database already exists: ${database}`);
      return;
    }

    await store.maintenance.server.send(
      new CreateDatabaseOperation({
        databaseName: database,
      }),
    );

    console.log(`Created RavenDB database: ${database}`);
  } finally {
    store.dispose();
  }
}

ensureIdsDmsDatabase().catch((error: unknown) => {
  console.error('Failed to ensure RavenDB database exists.', error);
  process.exit(1);
});
