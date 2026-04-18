const fs = require("fs");
const path = require("path");

// Get project root directory (parent of scripts/)
const scriptDir = __dirname;
const projectRoot = path.join(scriptDir, "..");
const memoriesPath = path.join(projectRoot, "data", "memories.json");

const data = JSON.parse(fs.readFileSync(memoriesPath, "utf-8"));

const active = data.filter(m => m.status === "active");
const compressed = data.filter(m => m.source === "compressed");

console.log("Active:", active.length);
console.log("Compressed:", compressed.length);

if (compressed.length === 0) {
  console.error("❌ No compressed memory generated");
  process.exit(1);
}

console.log("✅ Sanity check passed");