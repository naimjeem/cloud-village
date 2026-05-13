import { useEffect, useState } from 'react';
import type { ScanProvider } from '../loaders/awsScan';

export interface ProviderCreds {
  aws: {
    region: string;
    profile: string;
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  };
  cloudflare: {
    apiToken: string;
    accountId: string;
  };
  docker: {
    socketPath: string;
  };
  azure: {
    subscriptionId: string;
    tenantId: string;
    clientId: string;
    clientSecret: string;
  };
  gcp: {
    projectId: string;
    serviceAccountJson: string;
  };
}

const STORAGE_KEY = 'cloud-village-creds';

const EMPTY_CREDS: ProviderCreds = {
  aws: { region: '', profile: '', accessKeyId: '', secretAccessKey: '', sessionToken: '' },
  cloudflare: { apiToken: '', accountId: '' },
  docker: { socketPath: '' },
  azure: { subscriptionId: '', tenantId: '', clientId: '', clientSecret: '' },
  gcp: { projectId: '', serviceAccountJson: '' },
};

export function loadCreds(): ProviderCreds {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_CREDS;
    const parsed = JSON.parse(raw) as Partial<ProviderCreds>;
    return {
      aws: { ...EMPTY_CREDS.aws, ...(parsed.aws ?? {}) },
      cloudflare: { ...EMPTY_CREDS.cloudflare, ...(parsed.cloudflare ?? {}) },
      docker: { ...EMPTY_CREDS.docker, ...(parsed.docker ?? {}) },
      azure: { ...EMPTY_CREDS.azure, ...(parsed.azure ?? {}) },
      gcp: { ...EMPTY_CREDS.gcp, ...(parsed.gcp ?? {}) },
    };
  } catch {
    return EMPTY_CREDS;
  }
}

export function saveCreds(creds: ProviderCreds) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function clearCreds() {
  localStorage.removeItem(STORAGE_KEY);
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<ScanProvider>('aws');
  const [creds, setCreds] = useState<ProviderCreds>(EMPTY_CREDS);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    setCreds(loadCreds());
  }, []);

  const update = <P extends ScanProvider, K extends keyof ProviderCreds[P]>(
    provider: P,
    key: K,
    value: ProviderCreds[P][K]
  ) => {
    setCreds((c) => ({ ...c, [provider]: { ...c[provider], [key]: value } }));
  };

  const handleSave = () => {
    saveCreds(creds);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleClear = () => {
    if (!confirm('Wipe all stored credentials?')) return;
    clearCreds();
    setCreds(EMPTY_CREDS);
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
          width: 560,
          maxHeight: '85vh',
          overflowY: 'auto',
          color: '#e6edf3',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>⚙ Settings — Cloud Credentials</h3>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        <div
          style={{
            background: '#3a1f1f',
            border: '1px solid #5a2a2a',
            padding: 8,
            borderRadius: 6,
            fontSize: 11,
            color: '#f5b8b8',
            marginTop: 10,
          }}
        >
          ⚠ Stored in browser localStorage in plaintext. Anyone with access to your browser
          (or via XSS) can read these. Use read-only credentials only. For shared machines, prefer
          shell env vars on the backend.
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 14, borderBottom: '1px solid #1f2a44' }}>
          {(['aws', 'cloudflare', 'azure', 'gcp', 'docker'] as ScanProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => setTab(p)}
              style={{
                background: tab === p ? '#1f2a44' : 'transparent',
                color: tab === p ? '#5ec8ff' : '#9aa0a6',
                border: 'none',
                borderBottom: tab === p ? '2px solid #5ec8ff' : '2px solid transparent',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: 12,
                textTransform: 'uppercase',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 14 }}>
          {tab === 'aws' && (
            <>
              <Field label="Default Region">
                <input
                  value={creds.aws.region}
                  onChange={(e) => update('aws', 'region', e.target.value)}
                  placeholder="us-east-1"
                  style={inputStyle}
                />
              </Field>
              <Field label="Profile (overrides if access key empty)">
                <input
                  value={creds.aws.profile}
                  onChange={(e) => update('aws', 'profile', e.target.value)}
                  placeholder="default"
                  style={inputStyle}
                />
              </Field>
              <Field label="Access Key ID">
                <input
                  value={creds.aws.accessKeyId}
                  onChange={(e) => update('aws', 'accessKeyId', e.target.value)}
                  placeholder="AKIA…"
                  style={inputStyle}
                />
              </Field>
              <Field label="Secret Access Key">
                <input
                  type="password"
                  value={creds.aws.secretAccessKey}
                  onChange={(e) => update('aws', 'secretAccessKey', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Session Token (optional, for STS)">
                <input
                  type="password"
                  value={creds.aws.sessionToken}
                  onChange={(e) => update('aws', 'sessionToken', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Hint>
                Resolution order: static key (if filled) → profile → backend env / IMDS. Needs
                read-only IAM perms (see README).
              </Hint>
            </>
          )}

          {tab === 'cloudflare' && (
            <>
              <Field label="API Token">
                <input
                  type="password"
                  value={creds.cloudflare.apiToken}
                  onChange={(e) => update('cloudflare', 'apiToken', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Account ID (optional, auto-detects first)">
                <input
                  value={creds.cloudflare.accountId}
                  onChange={(e) => update('cloudflare', 'accountId', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Hint>Token scopes: Workers, KV, R2, D1, Pages, Queues, Zone Read.</Hint>
            </>
          )}

          {tab === 'azure' && (
            <>
              <Field label="Subscription ID">
                <input
                  value={creds.azure.subscriptionId}
                  onChange={(e) => update('azure', 'subscriptionId', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Tenant ID (service principal)">
                <input
                  value={creds.azure.tenantId}
                  onChange={(e) => update('azure', 'tenantId', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Client ID">
                <input
                  value={creds.azure.clientId}
                  onChange={(e) => update('azure', 'clientId', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Client Secret">
                <input
                  type="password"
                  value={creds.azure.clientSecret}
                  onChange={(e) => update('azure', 'clientSecret', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Hint>
                If client secret filled → service-principal auth. Else → DefaultAzureCredential
                (az login on backend host).
              </Hint>
            </>
          )}

          {tab === 'gcp' && (
            <>
              <Field label="Project ID">
                <input
                  value={creds.gcp.projectId}
                  onChange={(e) => update('gcp', 'projectId', e.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field label="Service Account JSON (paste contents)">
                <textarea
                  value={creds.gcp.serviceAccountJson}
                  onChange={(e) => update('gcp', 'serviceAccountJson', e.target.value)}
                  rows={6}
                  placeholder='{"type":"service_account",...}'
                  style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
                />
              </Field>
              <Hint>
                Empty → falls back to Application Default Credentials on backend host. Cloud Asset
                API must be enabled on project.
              </Hint>
            </>
          )}

          {tab === 'docker' && (
            <>
              <Field label="Socket Path">
                <input
                  value={creds.docker.socketPath}
                  onChange={(e) => update('docker', 'socketPath', e.target.value)}
                  placeholder="/var/run/docker.sock"
                  style={inputStyle}
                />
              </Field>
              <Hint>
                Backend must run on same host as Docker. <strong>📈 Live metrics</strong> after a
                Docker scan reports per-container CPU%, network rx+tx, and run/exit state — all
                local, no external service.
              </Hint>
            </>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 18,
            paddingTop: 12,
            borderTop: '1px solid #1f2a44',
          }}
        >
          <button onClick={handleClear} style={dangerBtn}>
            Wipe all
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {savedFlash && <span style={{ fontSize: 11, color: '#7ee787' }}>✓ Saved</span>}
            <button onClick={onClose} style={btnStyle}>
              Close
            </button>
            <button onClick={handleSave} style={primaryBtn}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginTop: 10, fontSize: 11, color: '#9aa0a6' }}>
      {label}
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: '#9aa0a6', marginTop: 8, lineHeight: 1.5 }}>{children}</div>
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
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  background: '#1f2a44',
  border: '1px solid #2a3a5a',
  color: '#e6edf3',
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const primaryBtn: React.CSSProperties = {
  background: '#5ec8ff',
  color: '#0b1220',
  border: 'none',
  padding: '6px 14px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
};

const dangerBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #5a2a2a',
  color: '#f5b8b8',
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
};

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#9aa0a6',
  fontSize: 20,
  cursor: 'pointer',
  padding: 0,
  width: 24,
  height: 24,
  lineHeight: '24px',
};
