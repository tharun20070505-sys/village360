import React, { useRef, useState, useEffect } from 'react';
import api from '../services/api';
import { PageHeading, Select, Input, ErrorState, LoadingState, Empty, pairs, items, useResource, useOptions, message } from './WorkspaceShared';
import { Activity, Zap, Database, Server, RefreshCw, ShieldCheck, Gauge } from 'lucide-react';

const groups = [
  ['villages', 'Villages'],
  ['wards', 'Wards'],
  ['users', 'People'],
  ['assignments', 'Assignments'],
  ['audit', 'Audit history'],
  ['telemetry', 'System Telemetry & Performance']
];

const targets = [
  ['households', 'Households'],
  ['infrastructure', 'Infrastructure locations'],
  ['farmers', 'Farmer interactions'],
  ['shgs', 'Self-help groups'],
  ['consultations', 'Panchayat consultations'],
  ['students', 'Students']
];

const initial = { households: 0, infrastructure: 30, farmers: 15, shgs: 5, consultations: 3, students: 25 };
const roleOptions = [
  ['admin', 'Administrator (Full access)'],
  ['surveyor', 'Surveyor / student'],
  ['viewer', 'Faculty coordinator']
];

function Form({ kind, editing, setEditing, options, onWrite, working }) {
  const [v, setV] = useState(() => ({
    ...editing,
    name: editing?.name || '',
    email: editing?.email || '',
    password: '',
    role: editing?.role || 'surveyor',
    village: editing?.village || '',
    user: editing?.user || '',
    team: editing?.team || '',
    targets: { ...initial, ...editing?.targets }
  }));

  const set = (k, x) => setV({ ...v, [k]: x });
  const title = (editing ? 'Edit ' : 'Create ') + ({ villages: 'village', wards: 'ward', users: 'account', assignments: 'assignment' }[kind]);
  const optionsUsers = (options.users || []).filter(u => u.role === 'surveyor' && u.active !== false).map(u => [u._id, u.name + ' · ' + (u.publicId || u.email)]);

  const submit = async event => {
    event.preventDefault();
    const payload = kind === 'villages'
      ? { name: v.name, targets: Object.fromEntries(Object.entries(v.targets).map(([k, x]) => [k, Number(x)])) }
      : kind === 'wards'
        ? (editing ? { name: v.name } : { name: v.name, village: v.village })
        : kind === 'users'
          ? (editing ? { name: v.name, role: v.role, ...(v.password ? { password: v.password } : {}) } : { name: v.name, email: v.email, password: v.password, role: v.role })
          : { user: v.user, village: v.village, ...(v.team ? { team: v.team } : {}) };

    await onWrite(editing ? 'patch' : 'post', '/' + kind + (editing ? '/' + editing._id : ''), payload, title + ' completed.');
  };

  return (
    <form className="ws-panel" onSubmit={submit}>
      <h3>{title}</h3>
      {kind !== 'assignments' && (
        <Input label={kind === 'users' ? 'Display name' : 'Name'} value={v.name} maxLength={100} required onChange={e => set('name', e.target.value)} />
      )}
      {kind === 'villages' && (
        <fieldset className="ws-fields">
          <legend>Pilot targets</legend>
          {targets.map(([key, label]) => (
            <Input key={key} label={label} type="number" min="0" max="1000000" required value={v.targets[key]} onChange={e => set('targets', { ...v.targets, [key]: e.target.value })} />
          ))}
        </fieldset>
      )}
      {((kind === 'wards' && !editing) || kind === 'assignments') && (
        <Select label="Village" options={pairs(options.villages)} all="Choose village" value={v.village} onChange={x => set('village', x)} required />
      )}
      {kind === 'users' && (
        <>
          {!editing && <Input label="Email" type="email" autoComplete="off" required value={v.email} onChange={e => set('email', e.target.value)} />}
          <Select label="Role" options={roleOptions} value={v.role} required onChange={x => set('role', x)} />
          <Input label={editing ? 'New password (leave blank to keep current)' : 'Initial password'} type="password" autoComplete="new-password" required={!editing} minLength={12} maxLength={128} value={v.password} onChange={e => set('password', e.target.value)} />
        </>
      )}
      {kind === 'assignments' && (
        <>
          <Select label="Surveyor" options={optionsUsers} all="Choose surveyor" required value={v.user} onChange={x => set('user', x)} />
          <Input label="Team (optional)" value={v.team} maxLength={80} onChange={e => set('team', e.target.value)} />
        </>
      )}
      <button type="submit" className="ws-primary" disabled={working}>
        {working ? 'Saving…' : editing ? 'Save changes' : title}
      </button>
      {editing && <button type="button" onClick={() => setEditing(null)}>Cancel</button>}
    </form>
  );
}

const cols = {
  villages: ['Village', 'Targets', 'Action'],
  wards: ['Ward', 'Village', 'Action'],
  users: ['Name', 'Role', 'Account', 'Action'],
  assignments: ['Surveyor', 'Village', 'Team', 'Action'],
  audit: ['Time', 'Action', 'Record', 'Changed by', 'Change history']
};

function labelById(options, value) {
  if (typeof value === 'object' && value) return value.name || value.publicId || value._id;
  const row = options?.find(row => row._id === value);
  return row?.name || row?.publicId || value || '—';
}

function TelemetryPanel({ notice, setNotice }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await api.get('/admin/metrics');
      setData(res.data);
      setError('');
    } catch (err) {
      setError(message(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClearCache = async () => {
    try {
      await api.post('/admin/cache/clear');
      setNotice('In-memory cache flushed.');
      fetchMetrics();
    } catch (err) {
      setError(message(err));
    }
  };

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={fetchMetrics} />;
  if (!data) return null;

  const { telemetry, cache, circuitBreaker, database, system, administrators } = data;

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: '#1a4933' }}>Real-Time System Telemetry & Performance</h3>
        <button
          type="button"
          onClick={() => { setRefreshing(true); fetchMetrics(); }}
          disabled={refreshing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Latency & Key Metrics Grid */}
      <div className="ws-stats">
        <div className="ws-metric">
          <div><Gauge size={16} /> Avg API Latency</div>
          <b>{telemetry.responseTime.avg} ms</b>
          <small style={{ color: '#557262' }}>p50: {telemetry.responseTime.p50}ms · p95: {telemetry.responseTime.p95}ms</small>
        </div>

        <div className="ws-metric">
          <div><Zap size={16} /> All Admins Response Time</div>
          <b style={{ color: '#166848' }}>{telemetry.adminResponseTime.avg || telemetry.responseTime.avg} ms</b>
          <small style={{ color: '#557262' }}>p95: {telemetry.adminResponseTime.p95 || telemetry.responseTime.p95}ms</small>
        </div>

        <div className="ws-metric">
          <div><Activity size={16} /> Throughput (RPM)</div>
          <b>{telemetry.requestsPerMinute} req/m</b>
          <small style={{ color: '#557262' }}>Total: {telemetry.totalRequests} reqs</small>
        </div>

        <div className="ws-metric">
          <div><Server size={16} /> Cache Hit Ratio</div>
          <b style={{ color: '#27704b' }}>{cache.hitRatio}</b>
          <small style={{ color: '#557262' }}>{cache.hits} hits · {cache.misses} misses · {cache.keys} keys</small>
        </div>

        <div className="ws-metric">
          <div><ShieldCheck size={16} /> Circuit Breaker</div>
          <b style={{ color: circuitBreaker.state === 'CLOSED' ? '#18724c' : '#c53030' }}>
            {circuitBreaker.state}
          </b>
          <small style={{ color: '#557262' }}>DB Ping: {database.latencyMs ?? '—'} ms</small>
        </div>
      </div>

      {/* Cache & Diagnostics Control */}
      <section className="ws-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1c4d37' }}>High-Speed Memory Cache & Reverse Proxy</h4>
            <p style={{ margin: 0, fontSize: '0.88rem', color: '#5b6b62' }}>
              Stores static LGD villages ({cache.keys} keys), wards, and survey discovery trees for sub-millisecond retrieval.
            </p>
          </div>
          <button type="button" className="ws-primary" onClick={handleClearCache}>
            Flush Cache
          </button>
        </div>
      </section>

      {/* Active Administrators Section */}
      <section className="ws-panel">
        <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#1c4d37' }}>Active System Administrators</h4>
        <div className="ws-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Administrator</th>
                <th>Email</th>
                <th>Public Identifier</th>
                <th>Access Level</th>
              </tr>
            </thead>
            <tbody>
              {administrators.map(a => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.email}</td>
                  <td><code>{a.id}</code></td>
                  <td><span style={{ color: '#156b46', fontWeight: 650 }}>Full Administrator Access</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Endpoints Breakdown */}
      {telemetry.slowestEndpoints && telemetry.slowestEndpoints.length > 0 && (
        <section className="ws-panel">
          <h4 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#1c4d37' }}>Endpoint Performance (Top Latency)</h4>
          <div className="ws-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>API Route</th>
                  <th>Request Count</th>
                  <th>Average Latency</th>
                </tr>
              </thead>
              <tbody>
                {telemetry.slowestEndpoints.map(e => (
                  <tr key={e.path}>
                    <td><code>{e.path}</code></td>
                    <td>{e.requests}</td>
                    <td><b>{e.avgMs} ms</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* System Resources */}
      <section className="ws-panel" style={{ fontSize: '0.88rem', color: '#50675a' }}>
        <strong>System Specs:</strong> Node {system.nodeVersion} on {system.platform} · Uptime: {Math.floor(telemetry.uptimeSeconds / 60)} min · Heap Used: {system.memory.heapUsedMb} MB / {system.memory.heapTotalMb} MB · RSS: {system.memory.rssMb} MB
      </section>
    </div>
  );
}

export default function Admin() {
  const [kind, setKind] = useState('villages');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const lock = useRef(false);
  const isTelemetry = kind === 'telemetry';

  const list = useResource(isTelemetry ? null : '/' + kind, { page, limit: 20 }, revision);
  const villages = useOptions(kind === 'wards' || kind === 'assignments' ? '/villages' : null, {}, revision);
  const users = useOptions(kind === 'assignments' || kind === 'audit' ? '/users' : null, {}, revision);

  const reset = key => {
    setKind(key);
    setPage(1);
    setEditing(null);
    setNotice('');
    setError('');
    setConfirm(null);
  };

  const write = async (method, path, data, success) => {
    if (lock.current) return;
    lock.current = true;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      await api.request({ method, url: path, data });
      setNotice(success);
      setEditing(null);
      setConfirm(null);
      setRevision(x => x + 1);
      setPage(1);
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setWorking(false);
    }
  };

  const edit = row => {
    setEditing(row);
    setConfirm(null);
    setNotice('');
    setError('');
  };

  const rows = items(list.data);

  const values = row => {
    if (kind === 'villages') {
      return [
        row.name,
        targets.map(([k, t]) => (row.targets?.[k] > 0 ? t + ' ' + row.targets[k] : null)).filter(Boolean).join(' · ') || '—',
        <button key="edit" onClick={() => edit(row)}>Edit</button>
      ];
    }
    if (kind === 'wards') {
      return [row.name, labelById(villages.data, row.village), <button key="edit" onClick={() => edit(row)}>Edit</button>];
    }
    if (kind === 'users') {
      return [
        <span key="user">{row.name}<br /><small>{row.email} · {row.publicId}</small></span>,
        row.role === 'admin' ? 'Administrator' : row.role === 'viewer' ? 'Faculty coordinator' : 'Surveyor',
        row.active ? 'Active' : 'Inactive',
        <div key={row._id} style={{ display: 'inline-flex', gap: '0.4rem' }}>
          <button type="button" onClick={() => edit(row)}>Edit</button>
          <button type="button" onClick={() => setConfirm(row)}>{row.active ? 'Deactivate' : 'Activate'}</button>
        </div>
      ];
    }
    if (kind === 'assignments') {
      return [
        labelById(users.data, row.user),
        labelById(villages.data, row.village),
        row.team || '—',
        <button key="remove" onClick={() => setConfirm(row)}>Remove</button>
      ];
    }
    return [
      new Date(row.createdAt).toLocaleString(),
      row.action,
      <span key="action">{row.kind}<br /><small>{row.record || row.publicId}</small></span>,
      labelById(users.data, row.createdBy),
      row.changes && Object.keys(row.changes).length ? (
        <details><summary>View changes</summary><pre className="ws-changes">{JSON.stringify(row.changes, null, 2)}</pre></details>
      ) : '—'
    ];
  };

  return (
    <main className="ws-page">
      <PageHeading eyebrow="Super administrator" title="Administration">
        Manage fieldwork locations, pilot targets, surveyor access and live system performance.
      </PageHeading>

      <div className="ws-tabs">
        {groups.map(([key, title]) => (
          <button key={key} type="button" disabled={working} aria-pressed={key === kind} onClick={() => reset(key)}>
            {title}
          </button>
        ))}
      </div>

      {notice && <p className="ws-notice" role="status">{notice}</p>}
      {(error || users.error || villages.error) && (
        <ErrorState error={error || users.error || villages.error} onRetry={() => { setError(''); setRevision(x => x + 1); }} />
      )}

      {confirm && (
        <section className="ws-panel">
          <h3>{kind === 'assignments' ? 'Remove this fieldwork assignment?' : (confirm.active ? 'Deactivate ' : 'Activate ') + confirm.name + '?'}</h3>
          <div className="ws-toolbar">
            <button
              className="ws-primary"
              disabled={working}
              onClick={() =>
                kind === 'assignments'
                  ? write('delete', '/assignments/' + confirm._id, undefined, 'Assignment removed.')
                  : write('patch', '/users/' + confirm._id, { active: !confirm.active }, 'Account updated.')
              }
            >
              Confirm
            </button>
            <button disabled={working} onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </section>
      )}

      {isTelemetry ? (
        <TelemetryPanel notice={notice} setNotice={setNotice} />
      ) : (
        <div className={kind === 'audit' ? '' : 'ws-admin-grid'}>
          {kind !== 'audit' && (
            <Form
              key={[kind, editing?._id, revision].join('-')}
              kind={kind}
              editing={editing}
              setEditing={setEditing}
              working={working}
              options={{ villages: villages.data, users: users.data }}
              onWrite={write}
            />
          )}
          <section className="ws-panel">
            <h3>{groups.find(([k]) => k === kind)?.[1]}</h3>
            {list.error ? (
              <ErrorState error={list.error} onRetry={() => setRevision(x => x + 1)} />
            ) : list.loading ? (
              <LoadingState />
            ) : rows.length ? (
              <div className="ws-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {cols[kind].map(c => (
                        <th key={c} scope="col">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row._id}>
                        {values(row).map((v, i) => (
                          <td key={i}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No records yet.</Empty>
            )}
            {(list.data?.total > 20 || page > 1) && (
              <nav className="ws-pager" aria-label="Record pages">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
                <span>Page {page}</span>
                <button disabled={page * 20 >= list.data?.total} onClick={() => setPage(page + 1)}>Next</button>
              </nav>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
