import { closeDb, dbPath } from "../db.js";

console.log(`db initialised at ${dbPath()}`);
closeDb();
