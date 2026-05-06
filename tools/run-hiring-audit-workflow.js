const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const DEFAULT_OUTPUT_PREFIX = "reports/hiring-workflow";
const DEFAULT_LIMIT = 80;

function printHelp() {
  console.log(`
Usage:
  node tools/run-hiring-audit-workflow.js [options]

Options:
  --town <name>             Limit audit to a town. Can be repeated.
  --towns <name,name>       Limit audit to comma-separated towns.
  --limit <number>          Number of companies to audit. Default: ${DEFAULT_LIMIT}.
  --offset <number>         Skip this many eligible companies.
  --include-reviewed        Re-audit records even when they already have a hiring signal.
  --include-no-website      Include records without usable websites in the audit report.
  --no-update               Write reports only; do not update companies.json.
  --output-prefix <path>    Output path prefix. Default: ${DEFAULT_OUTPUT_PREFIX}.
  --help                    Show this help.
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
    includeReviewed: false,
    includeNoWebsite: false,
    update: true,
    outputPrefix: DEFAULT_OUTPUT_PREFIX,
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
    } else if (arg === "--include-reviewed") {
      options.includeReviewed = true;
    } else if (arg === "--include-no-website") {
      options.includeNoWebsite = true;
    } else if (arg === "--no-update") {
      options.update = false;
    } else if (arg === "--output-prefix") {
      options.outputPrefix = readValue(args, index, arg).replace(/\.json$/i, "");
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

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
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function summarizeAudit(reportPath) {
  if (!fs.existsSync(reportPath)) return null;
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const counts = report.results.reduce((summary, result) => {
    summary[result.hiring_signal] = (summary[result.hiring_signal] || 0) + 1;
    return summary;
  }, {});
  return {
    eligible: report.eligible_count,
    audited: report.audited_count,
    counts
  };
}

function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const auditOutput = `${options.outputPrefix}-audit.json`;
  const auditArgs = [
    "tools/audit-hiring.js",
    "--limit",
    String(options.limit),
    "--offset",
    String(options.offset),
    "--output",
    auditOutput
  ];

  if (options.update) auditArgs.push("--update");
  if (!options.includeReviewed) auditArgs.push("--only-unaudited");
  if (options.includeNoWebsite) auditArgs.push("--include-no-website");
  if (options.towns.length) auditArgs.push("--towns", options.towns.join(","));

  runStep("Audit hiring signals", auditArgs, repoRoot);
  runStep("Refresh review queues", ["tools/export-review-queues.js"], repoRoot);

  const summary = summarizeAudit(path.join(repoRoot, auditOutput));
  if (summary) {
    console.log("\nWorkflow complete.");
    console.log(`Eligible records: ${summary.eligible}`);
    console.log(`Audited records: ${summary.audited}`);
    console.log(summary.counts);
  }
  console.log(`Audit report: ${auditOutput}`);
  console.log("Review queues: reports/positive-hiring-signals.csv, reports/unknown-hiring-signals.csv, reports/needs-website.csv");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
