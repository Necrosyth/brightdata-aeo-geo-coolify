/**
 * Migration registry — import and register all migrations here.
 * The engine uses this module to discover available migrations.
 */

import { addMigration } from "./migration-engine";
import { initialMigration } from "./001-initial";

// Register migrations in order
addMigration(initialMigration);

// Future migrations:
// import { migration002 } from "./002-some-feature";
// addMigration(migration002);
