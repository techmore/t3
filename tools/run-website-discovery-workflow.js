const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_OUTPUT_PREFIX = "reports/website-discovery";
const DEFAULT_LIMIT = 50;
const DEFAULT_MIN_SCORE = 12;
const DEFAULT_MIN_VERIFICATION_SCORE = 24;

function printHelp() {
  console.log(`
Usage:
  node tools/run-website-discovery-workflow.js [options]

Options:
  --town <name>                    Limit discovery to a town. Can be repeated.
  --towns <name,name>              Limit discovery to comma-separated towns.
  --limit <number>                 Number of companies to search. Default: ${DEFAULT_LIMIT}.
  --offset <number>                Skip this many companies in the discovery queue.
  --verify-limit <number>          Number of discovered companies to verify. Default: same as --limit.
  --output-prefix <path>           Output path prefix. Default: ${DEFAULT_OUTPUT_PREFIX}.
  --min-score <number>             Minimum discovery score to verify/prepare. Default: ${DEFAULT_MIN_SCORE}.
  --min-verification-score <number> Minimum verified score to prepare. Default: ${DEFAULT_MIN_VERIFICATION_SCORE}.
  --help                           Show this help.
`);
}

function readValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${optionName}`);
  }
  return value;
}

function parseNumber(value, optionName) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${optionName} must be a non-negative integer`);
  }
  return number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    towns: [],
    limit: DEFAULT_LIMIT,
    offset: 0,
    verifyLimit: null,
    outputPrefix: DEFAULT_OUTPUT_PREFIX,
    minScore: DEFAULT_MIN_SCORE,
    minVerificationScore: DEFAULT_MIN_VERIFICATION_SCORE,
    help: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--town") {
      options.towns.push(readValue(args, index, arg));
      index += 1;
    } else if (arg === "--towns") {
      options.towns.push(...readValue(args, index, arg).split(",").map((town) => town.trim()).filter(Boolean));
      index += 1;
    } else if (arg === "--limit") {
      options.limit = parseNumber(readValue(args, index, arg), arg);
      index += 1;
    } else if (arg === "--offset") {
      options.offset = parseNumber(readValue(args, index, arg), arg);
      index += 1;
    } else if (arg === "--verify-limit") {
      options.verifyLimit = parseNumber(readValue(args, index, arg), arg);
      index += 1;
    } else if (arg === "--output-prefix") {
      options.outputPrefix = readValue(args, index, arg).replace(/\.csv$/i, "");
      index += 1;
    } else if (arg === "--min-score") {
      options.minScore = parseNumber(readValue(args, index, arg), arg);
      index += 1;
    } else if (arg === "--min-verification-score") {
      options.minVerificationScore = parseNumber(readValue(args, index, arg), arg);
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.verifyLimit = options.verifyLimit ?? options.limit;
  options.towns = [...new Set(options.towns.map((town) => town.trim()).filter(Boolean))];
  return options;
}

function runStep(label, args, repoRoot) {
  console.log(`\n== ${label} ==`);
  console.log(`node ${args.join(" ")}`);
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function outputPaths(prefix) {
  return {
    candidates: `${prefix}-candidates.csv`,
    verified: `${prefix}-verified.csv`,
    updates: `${prefix}-updates.csv`
  };
}

function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const outputs = outputPaths(options.outputPrefix);

  const discoveryArgs = [
    "tools/discover-websites.js",
    "--limit",
    String(options.limit),
    "--offset",
    String(options.offset),
    "--output",
    outputs.candidates
  ];
  if (options.towns.length) {
    discoveryArgs.push("--towns", options.towns.join(","));
  }

  runStep("Discover candidate websites", discoveryArgs, repoRoot);
  runStep("Verify candidate websites", [
    "tools/verify-website-candidates.js",
    "--input",
    outputs.candidates,
    "--output",
    outputs.verified,
    "--limit",
    String(options.verifyLimit),
    "--min-score",
    String(options.minScore)
  ], repoRoot);
  runStep("Prepare approved-update review file", [
    "tools/prepare-website-updates.js",
    "--input",
    outputs.verified,
    "--output",
    outputs.updates,
    "--min-score",
    String(options.minScore),
    "--min-verification-score",
    String(options.minVerificationScore)
  ], repoRoot);

  console.log("\nWorkflow complete.");
  console.log(`Candidates: ${outputs.candidates}`);
  console.log(`Verified candidates: ${outputs.verified}`);
  console.log(`Review updates: ${outputs.updates}`);
  console.log("Set approved=yes in the review updates file before running tools/apply-website-updates.js.");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
