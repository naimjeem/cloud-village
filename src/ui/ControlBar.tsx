import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { VillageConfig } from '../types';
import { mockVillage } from '../data/mockVillage';
import { parseTerraformState } from '../loaders/terraform';
import { autoLayout } from '../loaders/autoLayout';
import { liveScan, type LiveScanRequest, type ScanProvider } from '../loaders/awsScan';
import { useMetricsPolling } from '../hooks/useMetricsPolling';
import { SettingsModal, loadCreds } from './SettingsModal';

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

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          zIndex: 10,
          background: 'rgba(11,18,32,0.85)',
          padding: 8,
          borderRadius: 8,
          border: '1px solid #1f2a44',
          flexWrap: 'wrap',
          maxWidth: 'calc(100vw - 380px)',
        }}
      >
        <Brand villageName={village.name} count={village.components.length} />
        <Sep />
        <Btn onClick={simulate}>▶ Simulate</Btn>
        <Btn onClick={randomAlert}>⚠ Alert</Btn>
        <Btn onClick={togglePause}>{paused ? '▶ Resume' : '⏸ Pause'}</Btn>
        <Btn onClick={() => setVillage(mockVillage)}>↺ Reset</Btn>
        <Sep />
        <Btn onClick={() => jsonRef.current?.click()}>📂 JSON</Btn>
        <Btn onClick={() => tfRef.current?.click()}>🧱 tfstate</Btn>
        <Btn onClick={() => setScanOpen(true)}>☁ Live scan</Btn>
        <Btn onClick={() => setSettingsOpen(true)}>⚙ Settings</Btn>
        <Btn onClick={exportFile}>⬇ Export</Btn>
        <Sep />
        <Btn onClick={cyclePhase}>{PHASE_ICON[timePhase]} {timePhase}</Btn>
        <Toggle on={autoCycle} onClick={toggleAutoCycle}>⟳ Auto</Toggle>
        <Sep />
        <Toggle on={metricsOn} onClick={() => setMetricsOn(!metricsOn)}>📈 Live metrics</Toggle>
        <input ref={jsonRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={onJsonFile} />
        <input ref={tfRef} type="file" accept="application/json,.tfstate" style={{ display: 'none' }} onChange={onTfFile} />
      </div>
      {scanOpen && <ScanModal onClose={() => setScanOpen(false)} onRun={runLiveScan} busy={scanning} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
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
          Backend must be running (<code>cd backend &amp;&amp; go run .</code>). Uses local credentials.
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

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#1f2a44',
        border: '1px solid #2a3a5a',
        color: '#e6edf3',
        padding: '5px 9px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: on ? '#5ec8ff' : '#1f2a44',
        color: on ? '#0b1220' : '#e6edf3',
        border: '1px solid #2a3a5a',
        padding: '5px 9px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: on ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 18, background: '#1f2a44' }} />;
}

function Brand({ villageName, count }: { villageName: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        lineHeight: 1.1,
        minWidth: 0,
        padding: '2px 6px',
        marginRight: 2,
      }}
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
          gap: 5,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          maxWidth: 220,
        }}
        title={`${count} components`}
      >
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#7ee787',
            boxShadow: '0 0 6px #7ee787',
            flexShrink: 0,
          }}
        />
        {/* <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{villageName}</span> */}
        <span style={{ color: '#7a8090' }}>{count} components</span>
      </span>
    </div>
  );
}
