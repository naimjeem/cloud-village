import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { VillageConfig } from '../types';
import { mockVillage } from '../data/mockVillage';
import { parseTerraformState } from '../loaders/terraform';
import { autoLayout } from '../loaders/autoLayout';
import { liveScan, type LiveScanRequest, type ScanProvider } from '../loaders/awsScan';
import { useMetricsPolling } from '../hooks/useMetricsPolling';
import { useIsCompact } from '../hooks/useIsCompact';
import { SettingsModal, loadCreds } from './SettingsModal';
import type { TimePhase, WeatherMode } from '../store';

export function ControlBar() {
  const jsonRef = useRef<HTMLInputElement>(null);
  const tfRef = useRef<HTMLInputElement>(null);
  const setVillage = useStore((s) => s.setVillage);
  const village = useStore((s) => s.village);
  const spawnFlow = useStore((s) => s.spawnFlow);
  const spawnAlert = useStore((s) => s.spawnAlert);
  const togglePause = useStore((s) => s.togglePause);
  const exportJson = useStore((s) => s.exportJson);
  const paused = useStore((s) => s.paused);

  const [scanOpen, setScanOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [metricsOn, setMetricsOn] = useState(false);
  useMetricsPolling(metricsOn);
  const metricsPanelOpen = useStore((s) => s.metricsPanelOpen);
  const toggleMetricsPanel = useStore((s) => s.toggleMetricsPanel);
  const viewMode = useStore((s) => s.viewMode);
  const toggleViewMode = useStore((s) => s.toggleViewMode);
  const weatherMode = useStore((s) => s.weatherMode);
  const setWeatherMode = useStore((s) => s.setWeatherMode);
  const weatherAuto = useStore((s) => s.weatherAuto);
  const toggleWeatherAuto = useStore((s) => s.toggleWeatherAuto);

  const timePhase = useStore((s) => s.timePhase);
  const cyclePhase = useStore((s) => s.cyclePhase);
  const autoCycle = useStore((s) => s.autoCycle);
  const toggleAutoCycle = useStore((s) => s.toggleAutoCycle);
  const PHASE_ICON = { dawn: '🌅', day: '🌞', dusk: '🌆', night: '🌙' } as const;

  const onJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as VillageConfig;
      if (!parsed.components || !parsed.connections) throw new Error('Invalid schema');
      setVillage({ ...parsed, components: autoLayout(parsed.components, parsed.connections) });
    } catch (err) {
      alert(`Failed to load: ${(err as Error).message}`);
    }
  };

  const onTfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const cfg = parseTerraformState(text);
      if (cfg.components.length === 0) {
        alert('No supported AWS resources found in tfstate.');
        return;
      }
      setVillage(cfg);
    } catch (err) {
      alert(`Terraform parse failed: ${(err as Error).message}`);
    }
  };

  const simulate = () => {
    village.connections.forEach((c, i) => {
      setTimeout(() => spawnFlow(c.id, 'request'), i * 120);
      setTimeout(() => spawnFlow(c.id, 'response'), i * 120 + 800);
    });
  };

  const randomAlert = () => {
    if (!village.components.length) return;
    const c = village.components[Math.floor(Math.random() * village.components.length)];
    const sevs: Array<'info' | 'warning' | 'critical'> = ['info', 'warning', 'critical'];
    const sev = sevs[Math.floor(Math.random() * sevs.length)];
    const msgs = {
      info: 'New deployment rolled out',
      warning: 'CPU above 75%',
      critical: 'Health check failing',
    };
    spawnAlert(c.id, sev, msgs[sev]);
  };

  const exportFile = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `village-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const setLastScanProvider = useStore((s) => s.setLastScanProvider);
  const runLiveScan = async (req: LiveScanRequest) => {
    setScanning(true);
    try {
      const merged = mergeStoredCreds(req);
      const cfg = await liveScan(merged);
      setVillage(cfg);
      setLastScanProvider(req.provider);
      setScanOpen(false);
    } catch (err) {
      alert(`Scan failed: ${(err as Error).message}\n\nMake sure backend is running:\n  cd backend && go run .`);
    } finally {
      setScanning(false);
    }
  };

  function mergeStoredCreds(req: LiveScanRequest): LiveScanRequest {
    const c = loadCreds();
    const out: LiveScanRequest = { ...req };
    const pick = (a: string | undefined, b: string) => (a && a.length ? a : b || undefined);
    if (req.provider === 'aws') {
      out.region = pick(req.region, c.aws.region);
      out.profile = pick(req.profile, c.aws.profile);
      out.accessKeyId = pick(undefined, c.aws.accessKeyId);
      out.secretAccessKey = pick(undefined, c.aws.secretAccessKey);
      out.sessionToken = pick(undefined, c.aws.sessionToken);
    } else if (req.provider === 'cloudflare') {
      out.apiToken = pick(req.apiToken, c.cloudflare.apiToken);
      out.accountId = pick(req.accountId, c.cloudflare.accountId);
    } else if (req.provider === 'docker') {
      out.socketPath = pick(req.socketPath, c.docker.socketPath);
    } else if (req.provider === 'azure') {
      out.subscriptionId = pick(req.subscriptionId, c.azure.subscriptionId);
      out.azureTenantId = pick(undefined, c.azure.tenantId);
      out.azureClientId = pick(undefined, c.azure.clientId);
      out.azureClientSecret = pick(undefined, c.azure.clientSecret);
    } else if (req.provider === 'gcp') {
      out.projectId = pick(req.projectId, c.gcp.projectId);
      out.gcpServiceAccountJson = pick(undefined, c.gcp.serviceAccountJson);
    }
    return out;
  }

  const healthCounts = countHealth(village.components);
  const compact = useIsCompact();
  const [menuOpen, setMenuOpen] = useState(false);
  const showGroups = !compact || menuOpen;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: compact ? 8 : 12,
          left: compact ? 8 : 12,
          right: compact ? 8 : 12,
          display: 'flex',
          gap: compact ? 5 : 8,
          rowGap: compact ? 6 : 8,
          alignItems: 'center',
          zIndex: 10,
          background: 'linear-gradient(180deg, rgba(15,22,42,0.92) 0%, rgba(11,18,32,0.88) 100%)',
          padding: compact ? '5px 7px' : '6px 10px',
          borderRadius: 12,
          border: '1px solid #1f2a44',
          flexWrap: 'wrap',
          boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <Brand
          villageName={village.name}
          count={village.components.length}
          healthCounts={healthCounts}
          alertCount={useStore.getState().alerts.length}
          compact={compact}
        />

        {compact && (
          <IconBtn
            onClick={() => setMenuOpen((v) => !v)}
            title={menuOpen ? 'Close menu' : 'Open menu'}
            label={menuOpen ? '✕' : '☰'}
            primary={menuOpen}
          />
        )}

        {showGroups && (
          <>
            <Group>
              <IconBtn
                onClick={togglePause}
                title={paused ? 'Resume animations (Space)' : 'Pause animations (Space)'}
                label={paused ? '▶' : '⏸'}
                primary={paused}
              />
              <IconBtn onClick={simulate} title="Replay flows on every edge" label="⚡" />
              <IconBtn onClick={randomAlert} title="Spawn a random alert" label="⚠" />
              <IconBtn onClick={() => setVillage(mockVillage)} title="Reload mock village" label="↺" />
            </Group>

            <Group>
              <DataMenu
                onJson={() => jsonRef.current?.click()}
                onTf={() => tfRef.current?.click()}
                onExport={exportFile}
                compact={compact}
              />
              {compact ? (
                <IconBtn onClick={() => setScanOpen(true)} title="Live cloud scan" label="☁" primary />
              ) : (
                <Btn onClick={() => setScanOpen(true)} accent title="Run a live cloud scan">☁ Live scan</Btn>
              )}
              <IconBtn onClick={() => setSettingsOpen(true)} title="Provider credentials" label="⚙" />
            </Group>

            <Group>
              <SegmentedSwitch
                options={[
                  { value: '3d', label: '🏘 3D' },
                  { value: '2d', label: '🗺 2D' },
                ]}
                value={viewMode}
                onChange={(v) => v !== viewMode && toggleViewMode()}
                title="Switch between 3D village and 2D architecture"
              />
              <PhasePill
                phase={timePhase}
                icon={PHASE_ICON[timePhase]}
                onCycle={cyclePhase}
                auto={autoCycle}
                onToggleAuto={toggleAutoCycle}
              />
              <WeatherSelector
                mode={weatherMode}
                auto={weatherAuto}
                onPick={setWeatherMode}
                onToggleAuto={toggleWeatherAuto}
              />
            </Group>

            <Group rightAlign={!compact}>
              <Toggle on={metricsOn} onClick={() => setMetricsOn(!metricsOn)} title="Poll backend /api/metrics every 4s">
                📈 {!compact && <span style={{ marginLeft: 4 }}>Live</span>}
                {metricsOn && <LivePulse />}
              </Toggle>
              <Toggle on={metricsPanelOpen} onClick={toggleMetricsPanel} title="Toggle metrics dashboard panel">
                📊 {!compact && <span style={{ marginLeft: 4 }}>Panel</span>}
              </Toggle>
            </Group>
          </>
        )}

        <input ref={jsonRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onJsonFile} />
        <input ref={tfRef} type="file" accept="application/json,.tfstate" style={{ display: 'none' }} onChange={onTfFile} />
      </div>
      {scanOpen && <ScanModal onClose={() => setScanOpen(false)} onRun={runLiveScan} busy={scanning} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function countHealth(components: VillageConfig['components']) {
  let healthy = 0, degraded = 0, down = 0;
  for (const c of components) {
    if (c.health === 'healthy') healthy++;
    else if (c.health === 'degraded') degraded++;
    else if (c.health === 'down') down++;
  }
  return { healthy, degraded, down };
}

function ScanModal({
  onClose,
  onRun,
  busy,
}: {
  onClose: () => void;
  onRun: (req: LiveScanRequest) => void;
  busy: boolean;
}) {
  const stored = loadCreds();
  const [provider, setProvider] = useState<ScanProvider>('aws');
  const [region, setRegion] = useState(stored.aws.region || 'ap-southeast-1');
  const [profile, setProfile] = useState(stored.aws.profile);
  const [apiToken, setApiToken] = useState('');
  const [accountId, setAccountId] = useState(stored.cloudflare.accountId);
  const [socketPath, setSocketPath] = useState(stored.docker.socketPath);
  const [subscriptionId, setSubscriptionId] = useState(stored.azure.subscriptionId);
  const [projectId, setProjectId] = useState(stored.gcp.projectId);
  const hasAwsKey = !!stored.aws.accessKeyId;
  const hasCfToken = !!stored.cloudflare.apiToken;
  const hasAzureSp = !!stored.azure.clientSecret;
  const hasGcpJson = !!stored.gcp.serviceAccountJson;

  const submit = () => {
    const req: LiveScanRequest = { provider };
    if (provider === 'aws') {
      req.region = region;
      if (profile) req.profile = profile;
    } else if (provider === 'cloudflare') {
      if (apiToken) req.apiToken = apiToken;
      if (accountId) req.accountId = accountId;
    } else if (provider === 'docker') {
      if (socketPath) req.socketPath = socketPath;
    } else if (provider === 'azure') {
      if (subscriptionId) req.subscriptionId = subscriptionId;
    } else if (provider === 'gcp') {
      if (projectId) req.projectId = projectId;
    }
    onRun(req);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0b1220',
          border: '1px solid #1f2a44',
          borderRadius: 10,
          padding: 20,
          width: 420,
          color: '#e6edf3',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Live scan</h3>
        <p style={{ fontSize: 12, color: '#9aa0a6', marginTop: 0 }}>
          Uses local credentials.
        </p>
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ScanProvider)}
            style={selectStyle}
          >
            <option value="aws">AWS</option>
            <option value="cloudflare">Cloudflare</option>
            <option value="docker">Docker (local)</option>
            <option value="azure">Azure</option>
            <option value="gcp">GCP</option>
          </select>
        </Field>

        {provider === 'aws' && (
          <>
            <Field label="Region">
              <input value={region} onChange={(e) => setRegion(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Profile (optional)">
              <input
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                placeholder="default — falls back to env vars"
                style={inputStyle}
              />
            </Field>
            <Hint>
              {hasAwsKey
                ? '✓ Using stored access key from Settings.'
                : 'No stored key. Falls back to profile, env vars, or IMDS on backend host. Set in ⚙ Settings to override.'}
            </Hint>
          </>
        )}

        {provider === 'cloudflare' && (
          <>
            <Field label="API Token (overrides stored, optional)">
              <input
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder={hasCfToken ? '✓ using stored token' : 'set in ⚙ Settings'}
                style={inputStyle}
              />
            </Field>
            <Field label="Account ID (optional)">
              <input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="auto-detect first account"
                style={inputStyle}
              />
            </Field>
            <Hint>
              {hasCfToken ? '✓ Using stored token from Settings.' : 'No stored token. Set in ⚙ Settings.'}
            </Hint>
          </>
        )}

        {provider === 'docker' && (
          <>
            <Field label="Socket path">
              <input
                value={socketPath}
                onChange={(e) => setSocketPath(e.target.value)}
                placeholder="/var/run/docker.sock (default)"
                style={inputStyle}
              />
            </Field>
            <Hint>
              Backend must run on the same machine as Docker. Reads containers, networks, volumes.
            </Hint>
          </>
        )}

        {provider === 'azure' && (
          <>
            <Field label="Subscription ID (optional)">
              <input
                value={subscriptionId}
                onChange={(e) => setSubscriptionId(e.target.value)}
                placeholder="AZURE_SUBSCRIPTION_ID env"
                style={inputStyle}
              />
            </Field>
            <Hint>
              {hasAzureSp
                ? '✓ Using stored service principal from Settings.'
                : 'No service principal stored. Backend uses DefaultAzureCredential (az login). Set in ⚙ Settings to override.'}
            </Hint>
          </>
        )}

        {provider === 'gcp' && (
          <>
            <Field label="Project ID (optional)">
              <input
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="GOOGLE_CLOUD_PROJECT env"
                style={inputStyle}
              />
            </Field>
            <Hint>
              {hasGcpJson
                ? '✓ Using stored service account JSON from Settings.'
                : 'No service account stored. Falls back to ADC (gcloud auth application-default login). Set in ⚙ Settings to override.'}
            </Hint>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: '#5ec8ff',
              color: '#0b1220',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: busy ? 'wait' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {busy ? 'Scanning…' : 'Scan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 6, lineHeight: 1.5 }}>{children}</div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#1f2a44',
  border: '1px solid #2a3a5a',
  color: '#e6edf3',
  padding: '6px 8px',
  borderRadius: 4,
  fontSize: 12,
};
const selectStyle = inputStyle;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 10, fontSize: 11, color: '#9aa0a6' }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function Btn({
  onClick,
  children,
  accent,
  title,
}: {
  onClick: () => void;
  children: React.ReactNode;
  accent?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: accent ? 'linear-gradient(180deg,#5ec8ff,#3aa5e0)' : '#1a2540',
        border: `1px solid ${accent ? '#5ec8ff' : '#2a3a5a'}`,
        color: accent ? '#0b1220' : '#e6edf3',
        padding: '6px 11px',
        borderRadius: 7,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: accent ? 600 : 500,
        boxShadow: accent ? '0 1px 0 rgba(255,255,255,0.12) inset, 0 2px 6px rgba(94,200,255,0.25)' : 'none',
        transition: 'background 0.15s, border-color 0.15s',
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  );
}

function IconBtn({
  onClick,
  label,
  title,
  primary,
}: {
  onClick: () => void;
  label: string;
  title: string;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        background: primary ? '#2a3a5a' : '#1a2540',
        border: `1px solid ${primary ? '#5ec8ff' : '#2a3a5a'}`,
        color: '#e6edf3',
        width: 30,
        height: 28,
        borderRadius: 7,
        cursor: 'pointer',
        fontSize: 13,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        padding: 0,
      }}
    >
      {label}
    </button>
  );
}

function Toggle({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: on ? 'linear-gradient(180deg,#5ec8ff,#3aa5e0)' : '#1a2540',
        color: on ? '#0b1220' : '#e6edf3',
        border: `1px solid ${on ? '#5ec8ff' : '#2a3a5a'}`,
        padding: '6px 11px',
        borderRadius: 7,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: on ? 600 : 500,
        boxShadow: on ? '0 1px 0 rgba(255,255,255,0.12) inset, 0 0 0 1px rgba(94,200,255,0.15)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  );
}

function Group({ children, rightAlign }: { children: React.ReactNode; rightAlign?: boolean }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        alignItems: 'center',
        padding: '3px 6px',
        background: 'rgba(11,18,32,0.45)',
        borderRadius: 9,
        border: '1px solid rgba(42,58,90,0.5)',
        marginLeft: rightAlign ? 'auto' : 0,
      }}
    >
      {children}
    </div>
  );
}

function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
  title,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        display: 'inline-flex',
        background: '#0e1729',
        border: '1px solid #2a3a5a',
        borderRadius: 7,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              background: active ? 'linear-gradient(180deg,#5ec8ff,#3aa5e0)' : 'transparent',
              color: active ? '#0b1220' : '#9aa0a6',
              border: 'none',
              padding: '3px 9px',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              lineHeight: 1.3,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const PHASE_LABEL: Record<TimePhase, string> = {
  dawn: 'Dawn',
  day: 'Day',
  dusk: 'Dusk',
  night: 'Night',
};

function PhasePill({
  phase,
  icon,
  onCycle,
  auto,
  onToggleAuto,
}: {
  phase: TimePhase;
  icon: string;
  onCycle: () => void;
  auto: boolean;
  onToggleAuto: () => void;
}) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <button
        onClick={onCycle}
        title={`Time of day: ${PHASE_LABEL[phase]}. Click to cycle.`}
        style={{
          background: '#1a2540',
          color: '#e6edf3',
          border: '1px solid #2a3a5a',
          padding: '6px 10px',
          borderRadius: '7px 0 0 7px',
          cursor: 'pointer',
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
        <span>{PHASE_LABEL[phase]}</span>
      </button>
      <button
        onClick={onToggleAuto}
        title={auto ? 'Auto-cycle every 12s. Click to stop.' : 'Manual time-of-day. Click for auto-cycle.'}
        style={{
          background: auto ? 'linear-gradient(180deg,#5ec8ff,#3aa5e0)' : '#1a2540',
          color: auto ? '#0b1220' : '#9aa0a6',
          border: '1px solid #2a3a5a',
          borderLeft: 'none',
          padding: '6px 8px',
          borderRadius: '0 7px 7px 0',
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: auto ? 600 : 500,
          lineHeight: 1.2,
        }}
      >
        ⟳
      </button>
    </span>
  );
}

function DataMenu({
  onJson,
  onTf,
  onExport,
  compact,
}: {
  onJson: () => void;
  onTf: () => void;
  onExport: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <Btn onClick={() => setOpen((v) => !v)} title="Import / export village data">
        ⤓{!compact && <> Data</>} <span style={{ marginLeft: 2, opacity: 0.7 }}>▾</span>
      </Btn>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            minWidth: 200,
            background: '#0b1220',
            border: '1px solid #1f2a44',
            borderRadius: 8,
            padding: 4,
            boxShadow: '0 8px 22px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 20,
          }}
        >
          <MenuItem
            icon="📂"
            label="Load JSON"
            hint="Upload VillageConfig.json"
            onClick={() => {
              setOpen(false);
              onJson();
            }}
          />
          <MenuItem
            icon="🧱"
            label="Load Terraform state"
            hint="Upload terraform.tfstate"
            onClick={() => {
              setOpen(false);
              onTf();
            }}
          />
          <div style={{ height: 1, background: '#1f2a44', margin: '2px 0' }} />
          <MenuItem
            icon="⬇"
            label="Export village"
            hint="Download current as JSON"
            onClick={() => {
              setOpen(false);
              onExport();
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, hint, onClick }: { icon: string; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'transparent',
        border: 'none',
        color: '#e6edf3',
        padding: '8px 10px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        textAlign: 'left',
        width: '100%',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#1f2a44')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span>{label}</span>
        {hint && <span style={{ fontSize: 10, color: '#9aa0a6', marginTop: 2 }}>{hint}</span>}
      </span>
    </button>
  );
}

function LivePulse() {
  return (
    <span
      style={{
        marginLeft: 6,
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: '#0b1220',
        animation: 'vk-live-pulse 1.6s ease-in-out infinite',
        display: 'inline-block',
      }}
    >
      <style>{`@keyframes vk-live-pulse {
        0%,100% { box-shadow: 0 0 0 0 rgba(11,18,32,0.6); opacity: 1; }
        50%     { box-shadow: 0 0 0 4px rgba(11,18,32,0); opacity: 0.5; }
      }`}</style>
    </span>
  );
}

const WEATHER_ICON: Record<WeatherMode, string> = {
  clear:  '☀',
  cloudy: '☁',
  rain:   '🌧',
  storm:  '⛈',
};

const WEATHER_LABEL: Record<WeatherMode, string> = {
  clear:  'Clear',
  cloudy: 'Cloudy',
  rain:   'Rain',
  storm:  'Storm',
};

const WEATHER_ORDER: WeatherMode[] = ['clear', 'cloudy', 'rain', 'storm'];

function WeatherSelector({
  mode,
  auto,
  onPick,
  onToggleAuto,
}: {
  mode: WeatherMode;
  auto: boolean;
  onPick: (m: WeatherMode) => void;
  onToggleAuto: () => void;
}) {
  const cycle = () => {
    const i = WEATHER_ORDER.indexOf(mode);
    onPick(WEATHER_ORDER[(i + 1) % WEATHER_ORDER.length]);
  };
  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <button
        onClick={cycle}
        title={
          auto
            ? `Auto weather (derived from fleet health). Click to override → ${WEATHER_LABEL[mode]}`
            : `Manual weather: ${WEATHER_LABEL[mode]}. Click to cycle`
        }
        style={{
          background: '#1f2a44',
          border: `1px solid ${auto ? '#2a3a5a' : '#5ec8ff'}`,
          color: '#e6edf3',
          padding: '5px 9px',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 12,
          display: 'inline-flex',
          gap: 5,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{WEATHER_ICON[mode]}</span>
        <span>{WEATHER_LABEL[mode]}</span>
      </button>
      <button
        onClick={onToggleAuto}
        title={auto ? 'Weather auto-derives from health/alerts. Click to lock manual.' : 'Weather manually set. Click to resume auto.'}
        style={{
          background: auto ? '#5ec8ff' : '#1f2a44',
          color: auto ? '#0b1220' : '#9aa0a6',
          border: '1px solid #2a3a5a',
          padding: '5px 8px',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 11,
          fontWeight: auto ? 600 : 400,
        }}
      >
        ⟳ Auto
      </button>
    </span>
  );
}

function Brand({
  villageName,
  count,
  healthCounts,
  alertCount,
  compact,
}: {
  villageName: string;
  count: number;
  healthCounts: { healthy: number; degraded: number; down: number };
  alertCount: number;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        lineHeight: 1.15,
        minWidth: 0,
        padding: '2px 10px 2px 6px',
        marginRight: 4,
      }}
      title={`${count} components · ${healthCounts.healthy} healthy · ${healthCounts.degraded} degraded · ${healthCounts.down} down · ${alertCount} active alert${alertCount === 1 ? '' : 's'}`}
    >
      <strong
        style={{
          fontSize: 13,
          letterSpacing: 0.4,
          background: 'linear-gradient(90deg,#9fdcff 0%,#7ab8ff 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 220,
        }}
      >
        {villageName}
      </strong>
      <span
        style={{
          fontSize: 10,
          color: '#9aa0a6',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: 2,
        }}
      >
        <span style={{ color: '#7a8090' }}>{count} comp</span>
        {!compact && (
          <>
            <span style={{ color: '#1f2a44' }}>│</span>
            <HealthChip color="#22c55e" count={healthCounts.healthy} title="Healthy" />
            <HealthChip color="#f59e0b" count={healthCounts.degraded} title="Degraded" />
            <HealthChip color="#ef4444" count={healthCounts.down} title="Down" />
          </>
        )}
        {compact && healthCounts.down > 0 && <HealthChip color="#ef4444" count={healthCounts.down} title="Down" />}
        {compact && healthCounts.down === 0 && healthCounts.degraded > 0 && (
          <HealthChip color="#f59e0b" count={healthCounts.degraded} title="Degraded" />
        )}
        {alertCount > 0 && (
          <>
            {!compact && <span style={{ color: '#1f2a44' }}>│</span>}
            <span
              title={`${alertCount} active alert${alertCount === 1 ? '' : 's'}`}
              style={{
                background: '#3a1f1f',
                color: '#ffb4b4',
                padding: '1px 6px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              ⚠ {alertCount}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

function HealthChip({ color, count, title }: { color: string; count: number; title: string }) {
  return (
    <span title={`${title}: ${count}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 5px ${color}`,
          display: 'inline-block',
        }}
      />
      <span style={{ color: count > 0 ? '#e6edf3' : '#5a6275', fontWeight: count > 0 ? 600 : 400 }}>{count}</span>
    </span>
  );
}
