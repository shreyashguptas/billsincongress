/**
 * Idempotent PostHog Self-driving setup for Bills in Congress.
 *
 * Configures signal sources, tunes the scout troop, creates Replay Vision
 * scanners (when the API is available), and writes scout steering notes so
 * agent PRs respect Documentation/ANALYTICS.md.
 *
 * Prerequisites:
 *   1. `posthog-cli login` (or set POSTHOG_CLI_API_KEY + POSTHOG_CLI_PROJECT_ID)
 *   2. Organization AI data processing enabled in PostHog
 *   3. GitHub repo connected in PostHog (manual — OAuth in the UI)
 *
 * Billing cap (manual, once): Organization → Billing → Inbox → set limit to $0.
 * That keeps the first 3 PRs/month free and blocks paid PR generation.
 *
 * Usage:
 *   POSTHOG_CLI_PROJECT_ID=451900 pnpm posthog:self-driving
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POSTHOG_PROJECT_ID = process.env.POSTHOG_CLI_PROJECT_ID ?? '451900';
const CLI = join(ROOT, 'node_modules/.bin/posthog-cli');

type ApiResult = unknown;

function die(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function log(section: string, message: string) {
  console.log(`\n[${section}] ${message}`);
}

function apiCall<T = ApiResult>(tool: string, payload: Record<string, unknown> = {}): T {
  const json = JSON.stringify(payload);
  try {
    const out = execFileSync(CLI, ['api', 'call', '--json', tool, json], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        POSTHOG_CLI_PROJECT_ID: POSTHOG_PROJECT_ID,
      },
    });
    return JSON.parse(out) as T;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`${tool} failed: ${msg}`);
  }
}

function apiAvailable(tool: string): boolean {
  try {
    execFileSync(CLI, ['api', 'info', tool], { cwd: ROOT, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function verifyAnalyticsContract() {
  log('analytics', 'Running analytics contract test…');
  execFileSync(join(ROOT, 'node_modules/.bin/tsx'), ['lib/analytics-contract.test.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function verifyCredentials() {
  try {
    apiCall('project-get', { id: '@current' });
  } catch {
    die(
      'PostHog CLI is not authenticated.\n' +
        '  Run: posthog-cli login\n' +
        '  Or set POSTHOG_CLI_API_KEY (phx_…) and POSTHOG_CLI_PROJECT_ID=451900',
    );
  }
  log('auth', `Connected to PostHog project ${POSTHOG_PROJECT_ID}`);
}

type SourceConfig = {
  id: string;
  source_product: string;
  source_type: string;
  enabled: boolean;
};

function listSources(): SourceConfig[] {
  const result = apiCall<{ results?: SourceConfig[] }>('inbox-source-configs-list', {});
  return result.results ?? (Array.isArray(result) ? (result as SourceConfig[]) : []);
}

function enableSource(source_product: string, source_type: string) {
  const key = `${source_product}/${source_type}`;
  const existing = listSources().find(
    (row) => row.source_product === source_product && row.source_type === source_type,
  );

  if (existing?.enabled) {
    log('sources', `${key} — already enabled`);
    return;
  }

  if (existing) {
    apiCall('inbox-source-configs-partial-update', { id: existing.id, enabled: true });
    log('sources', `${key} — re-enabled`);
    return;
  }

  try {
    apiCall('inbox-source-configs-create', {
      source_product,
      source_type,
      enabled: true,
    });
    log('sources', `${key} — created and enabled`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('400') || msg.toLowerCase().includes('unique')) {
      const retry = listSources().find(
        (row) => row.source_product === source_product && row.source_type === source_type,
      );
      if (retry) {
        apiCall('inbox-source-configs-partial-update', { id: retry.id, enabled: true });
        log('sources', `${key} — enabled after race`);
        return;
      }
    }
    log('sources', `${key} — FAILED (${msg}). Record as follow-up.`);
  }
}

function enableNativeSources() {
  log('sources', 'Enabling native signal sources…');

  // Scout gate: on by default — only flip if someone opted out.
  const scoutGate = listSources().find(
    (row) => row.source_product === 'signals_scout' && row.source_type === 'cross_source_issue',
  );
  if (scoutGate && !scoutGate.enabled) {
    apiCall('inbox-source-configs-partial-update', { id: scoutGate.id, enabled: true });
    log('sources', 'signals_scout/cross_source_issue — re-enabled (was opted out)');
  } else if (!scoutGate) {
    log('sources', 'signals_scout/cross_source_issue — on by default (no row needed)');
  }

  enableSource('health_checks', 'health_issue');
  enableSource('error_tracking', 'issue_created');
  enableSource('error_tracking', 'issue_reopened');
  enableSource('error_tracking', 'issue_spiking');
  enableSource('conversations', 'ticket');
}

type ScoutConfig = {
  id: string;
  skill_name: string;
  enabled: boolean;
  emit?: boolean;
};

function listScouts(): ScoutConfig[] {
  if (!apiAvailable('signals-scout-config-list')) {
    return [];
  }
  const result = apiCall<{ results?: ScoutConfig[] }>('signals-scout-config-sync', {});
  const rows = result.results ?? (Array.isArray(result) ? (result as ScoutConfig[]) : []);
  if (rows.length > 0) return rows;
  return apiCall<{ results?: ScoutConfig[] }>('signals-scout-config-list', {}).results ?? [];
}

const ENABLED_SCOUTS = new Set([
  'signals-scout-general',
  'signals-scout-product-analytics',
  'signals-scout-web-analytics',
  'signals-scout-health-checks',
]);

/** Routed elsewhere — keep disabled to avoid duplicate findings. */
const ROUTED_SCOUTS = new Set(['signals-scout-error-tracking', 'signals-scout-session-replay']);

function configureScouts() {
  log('scouts', 'Syncing and tuning scout troop…');

  if (!apiAvailable('signals-scout-config-sync')) {
    log('scouts', 'Scout API unavailable — tune manually in PostHog Inbox → Configuration');
    return;
  }

  const scouts = listScouts();
  if (scouts.length === 0) {
    log('scouts', 'No scout configs returned — they materialize within ~30 minutes on first setup');
    return;
  }

  let enabled = 0;
  let disabled = 0;

  for (const scout of scouts) {
    const shouldEnable = ENABLED_SCOUTS.has(scout.skill_name);
    const isRouted = ROUTED_SCOUTS.has(scout.skill_name);

    if (scout.enabled === shouldEnable) {
      if (shouldEnable) enabled++;
      else disabled++;
      continue;
    }

    try {
      apiCall('signals-scout-config-update', {
        id: scout.id,
        enabled: shouldEnable,
      });
      if (shouldEnable) {
        enabled++;
        log('scouts', `enabled ${scout.skill_name.replace('signals-scout-', '')}`);
      } else {
        disabled++;
        const reason = isRouted ? 'routed to native source / replay vision' : 'not in top surfaces';
        log('scouts', `disabled ${scout.skill_name.replace('signals-scout-', '')} (${reason})`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('scouts', `FAILED to update ${scout.skill_name}: ${msg}`);
    }
  }

  log('scouts', `Troop: ${enabled} active, ${disabled} disabled`);
}

const PRODUCT_CONTEXT = [
  'Bills in Congress (billsincongress.com) is an independent U.S. legislation tracker.',
  'Readers browse/filter bills, open bill detail pages, and ask grounded questions via a persistent answer panel.',
  'Custom analytics live in lib/analytics.ts; Documentation/ANALYTICS.md is the event registry.',
  'Answer accuracy under convex/catalog/ and convex/answer.ts is safety-critical — never auto-fix without scripts/truth tests.',
].join(' ');

type ReplayVisionScannerPayload = {
  name: string;
  scanner_type: string;
  emits_signals: boolean;
  scanner_config: { prompt: string };
  query: Record<string, unknown>;
  sampling_rate: number;
  model: string;
};

const BROKEN_SCANNER: ReplayVisionScannerPayload = {
  name: 'Bill browse and answer failures',
  scanner_type: 'monitor',
  emits_signals: true,
  scanner_config: {
    prompt: [
      'Watch this session for moments where the product visibly broke for the user: an error message or toast, a blank/white screen, content that failed to load, obviously broken layout, a spinner that never resolves, or a button/form/action that clearly did nothing or failed.',
      'In this product that especially means: the bills list stuck empty while filters are active, the answer panel showing an error or spinning forever, a bill detail page that fails to render summary or metadata, dashboard charts not loading, or navigation that leaves the reader on a broken /bills URL.',
      'Only flag issues that are unambiguous on screen and would actually matter to the user – ignore cosmetic nits and anything you are unsure about.',
      'For each: what the user was trying to do, what broke, and the URL.',
      '',
      PRODUCT_CONTEXT,
    ].join(' '),
  },
  query: {
    kind: 'RecordingsQuery',
    properties: [
      { key: '$current_url', value: '/bills', operator: 'icontains', type: 'event' },
    ],
  },
  sampling_rate: 0.5,
  model: 'gemini-3-flash-preview',
};

const FRUSTRATION_SCANNER: ReplayVisionScannerPayload = {
  name: 'Browse and ask frustration',
  scanner_type: 'monitor',
  emits_signals: true,
  scanner_config: {
    prompt: [
      'Watch this session for clear signs the user got stuck or frustrated: repeatedly clicking the same element, hammering a button that is not responding, retrying the same action over and over, visibly hunting for something they cannot find, or abandoning a flow partway through.',
      'In this product that especially means: rage-clicking filter chips or the load-more control on /bills, hammering the ask launcher when the answer panel will not open, retrying sign-in or rate-limit dialogs, or clicking bill cards that do not navigate.',
      'Only flag genuine struggle you can see – not normal browsing or a single mis-click.',
      'For each: what they were trying to do, where they got stuck, and the URL.',
      '',
      PRODUCT_CONTEXT,
    ].join(' '),
  },
  query: {
    kind: 'RecordingsQuery',
    events: [{ id: '$rageclick', type: 'events' }],
  },
  sampling_rate: 1.0,
  model: 'gemini-3-flash-preview',
};

function createReplayVisionScanners() {
  log('replay-vision', 'Setting up session replay scanners…');

  const createTool = 'vision-scanners-create';
  const listTool = 'vision-scanners-list';
  const updateTool = 'vision-scanners-update';

  if (!apiAvailable(createTool)) {
    log(
      'replay-vision',
      'Scanner API not on this PostHog deploy — create monitors manually in PostHog → Session replay → Replay Vision, or re-run after upgrading.',
    );
    return;
  }

  type ScannerRow = { id: string; name: string; emits_signals?: boolean };
  let existing: ScannerRow[] = [];
  try {
    const listed = apiCall<{ results?: ScannerRow[] }>(listTool, {});
    existing = listed.results ?? [];
  } catch {
    log('replay-vision', 'Could not list scanners — skipping creation');
    return;
  }

  const upsert = (payload: ReplayVisionScannerPayload, matchPhrase: string) => {
    const match = existing.find((row) => row.name === payload.name);
    if (match) {
      if (match.emits_signals) {
        log('replay-vision', `"${payload.name}" — already exists with signals on`);
        return;
      }
      try {
        apiCall(updateTool, { id: match.id, ...payload });
        log('replay-vision', `"${payload.name}" — upgraded to emits_signals`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log('replay-vision', `"${payload.name}" — update failed: ${msg}`);
      }
      return;
    }

    const duplicate = existing.find((row) =>
      row.name.toLowerCase().includes(matchPhrase.split(' ')[0] ?? ''),
    );
    if (duplicate?.emits_signals) {
      log('replay-vision', `"${payload.name}" — similar scanner "${duplicate.name}" already emits signals`);
      return;
    }

    try {
      apiCall(createTool, payload);
      log('replay-vision', `"${payload.name}" — created`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log('replay-vision', `"${payload.name}" — create failed: ${msg}`);
    }
  };

  upsert(BROKEN_SCANNER, 'visibly broke');
  upsert(FRUSTRATION_SCANNER, 'got stuck');
}

function writeScoutScratchpad() {
  if (!apiAvailable('signals-scout-scratchpad-remember')) {
    log('scratchpad', 'Scratchpad API unavailable — paste scout note from Documentation/ANALYTICS.md manually');
    return;
  }

  const steering = readFileSync(join(ROOT, 'Documentation/ANALYTICS.md'), 'utf8');
  const contractStart = steering.indexOf('## ⚠️ The contract');
  const contractEnd = steering.indexOf('---', contractStart + 1);
  const contract =
    contractStart !== -1 && contractEnd !== -1
      ? steering.slice(contractStart, contractEnd).trim()
      : 'See Documentation/ANALYTICS.md for the analytics contract.';

  const content = [
    '# Bills in Congress — agent steering for Self-driving PRs',
    '',
    contract,
    '',
    '## Additional hard rules',
    '',
    '- Never call posthog.capture() outside lib/analytics.ts.',
    '- instrumentation-client.ts is the only posthog.init() site.',
    '- Do not change lib/error-filter.ts without updating lib/error-filter.test.ts.',
    '- Do not touch convex/catalog/ or convex/answer.ts without scripts/truth/ cases.',
    '- Billing: this project caps Self-driving at 3 free PRs/month (Inbox billing limit $0).',
    '',
    'Repo: https://github.com/shreyashguptas/billsincongress',
  ].join('\n');

  try {
    apiCall('signals-scout-scratchpad-remember', {
      key: 'billsincongress-analytics-contract',
      content,
    });
    log('scratchpad', 'Wrote analytics contract to scout scratchpad');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('scratchpad', `Failed to write scratchpad: ${msg}`);
  }
}

function printManualFollowUps() {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Manual steps (cannot be done via API)

1. Billing cap — stay on 3 free PRs/month only:
   PostHog → Organization settings → Billing → Inbox
   Set billing limit to $0 (blocks paid PRs; first 3/month stay free)

2. Connect GitHub (required for PRs):
   PostHog → Settings → Integrations → GitHub
   Connect: shreyashguptas/billsincongress

3. AI data processing (required for Self-driving):
   PostHog → Organization settings → AI → enable data processing

4. Claude subscription: Self-driving uses PostHog's AI, not your Claude
   subscription. There is no BYOK option today.

5. Broken insights (optional UI fix — see Documentation/ANALYTICS.md):
   Five insights still query retired bill_chat_* events. Rebuild on answer_*.

Inbox: https://us.posthog.com/project/${POSTHOG_PROJECT_ID}/inbox
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

function main() {
  console.log('PostHog Self-driving setup — Bills in Congress\n');
  verifyAnalyticsContract();
  verifyCredentials();
  enableNativeSources();
  configureScouts();
  createReplayVisionScanners();
  writeScoutScratchpad();
  printManualFollowUps();
  console.log('\n✓ Setup script finished. Review follow-ups above.\n');
}

main();
