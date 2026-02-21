/**
 * Dev utility — deletes ALL customers from the Asaas sandbox.
 * Run with: npm run dev:cleanup
 *
 * ⚠️  Only works against the sandbox URL. Will throw if a production key is used.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { AsaasClient } from "../src/asaas.js";

config({ path: resolve(process.cwd(), ".env.test") });

const apiKey = process.env.ASAAS_API_KEY;

if (!apiKey) {
  console.error("❌  ASAAS_API_KEY not found. Create a .env.test file based on .env.test.example");
  process.exit(1);
}

if (!apiKey.startsWith("$aact_hmlg")) {
  console.error("❌  This script only runs with a sandbox key (starts with $aact_hmlg_). Aborting.");
  process.exit(1);
}

const client = new AsaasClient({ apiKey, sandbox: true, userAgent: "better-auth-asaas-cleanup" });

async function deleteAllCustomers() {
  let offset = 0;
  const limit = 100;
  let total = 0;
  let deleted = 0;
  let failed = 0;

  console.log("🔍  Fetching customers from Asaas sandbox...\n");

  while (true) {
    const page = await client.listCustomers({ limit, offset });

    if (total === 0) {
      total = page.totalCount;
      if (total === 0) {
        console.log("✅  No customers found — sandbox is already clean.");
        return;
      }
      console.log(`Found ${total} customer(s). Deleting...\n`);
    }

    for (const customer of page.data) {
      try {
        await client.deleteCustomer(customer.id);
        console.log(`  🗑️  Deleted ${customer.id}  ${customer.name} <${customer.email}>`);
        deleted++;
      } catch (err) {
        console.error(`  ⚠️  Failed to delete ${customer.id}: ${(err as Error).message}`);
        failed++;
      }
    }

    if (!page.hasMore) break;
    offset += limit;
  }

  console.log(`\n✅  Done. Deleted: ${deleted}  |  Failed: ${failed}`);
}

deleteAllCustomers().catch((err) => {
  console.error("❌  Unexpected error:", err);
  process.exit(1);
});
