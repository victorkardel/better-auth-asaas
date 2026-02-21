import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.test if present (for integration tests)
dotenv.config({ path: resolve(process.cwd(), ".env.test") });
