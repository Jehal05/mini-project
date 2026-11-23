// Development page at ?ui-kit: every primitive in light and dark, so the design system can be reviewed in one place.
import { useState } from 'react';
import Button from './Button.jsx';
import { Card, Panel, StatTile, Badge, SeverityBadge } from './Surface.jsx';
import { Field, Input, Select, Checkbox } from './Form.jsx';
import { Skeleton, EmptyState, ErrorState, Toast } from './Feedback.jsx';
import { Modal, Tooltip } from './Overlay.jsx';
import { Table, ProgressRing, Timeline, Tabs } from './Data.jsx';
import EcgTrace from './EcgTrace.jsx';
import Sparkline from './Sparkline.jsx';
import Icon, { ICON_NAMES } from './icons.jsx';
import { ROLES } from './roles.js';
import { SEVERITIES } from './tokens.js';
import { classifyVital, VITAL_TONE } from './vitals.js';

export default function UiKit() {
  const [dark, setDark] = useState(false);
  const [role, setRole] = useState('patient');
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('a');
  return (
    <div data-role={role} data-theme={dark ? 'dark' : 'light'} className="paper-bg min-h-screen p-4 text-ink sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center gap-3">
          <EcgTrace />
          <h1 className="font-title text-3xl font-semibold">HealthTwin design kit</h1>
          <div className="ml-auto flex flex-wrap gap-2">
            <Select aria-label="Role accent" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select>
            <Button variant="secondary" icon={dark ? 'sun' : 'moon'} onClick={() => setDark(!dark)}>{dark ? 'Light' : 'Dark'}</Button>
          </div>
        </header>

        <Panel title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button icon="check">Accept case</Button><Button variant="secondary">Cancel</Button><Button variant="quiet">Skip</Button>
            <Button variant="danger" icon="triangle-alert">Restore</Button><Button busy>Saving</Button><Button disabled>Disabled</Button><Button size="lg" icon="phone">Call 112</Button>
          </div>
        </Panel>

        <Panel title="Severity and vitals">
          <div className="flex flex-wrap gap-2">{SEVERITIES.map((s) => <SeverityBadge key={s} severity={s} />)}<Badge tone="info" icon="info">Info</Badge></div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['heartRate', 'Heart rate', 'bpm', 126], ['spo2', 'Oxygen', '%', 93], ['systolic', 'Systolic', 'mmHg', 118], ['respiratoryRate', 'Breathing', '/min', 18]].map(([k, l, u, v]) => (
              <StatTile key={k} label={l} unit={u} value={v} tone={VITAL_TONE[classifyVital(k, v)]} note={classifyVital(k, v) === 'normal' ? 'In range' : 'Outside range'} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-4"><Sparkline values={[110, 114, 121, 119, 126, 124, 130]} /><ProgressRing fraction={0.6} tone="high" label="36 minutes left">36m</ProgressRing></div>
        </Panel>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel title="Form">
            <div className="space-y-3">
              <Field label="Patient name" hint="As on the ID card">{(p) => <Input placeholder="Full name" {...p} />}</Field>
              <Field label="Phone" error="Enter a 10 digit number">{(p) => <Input {...p} />}</Field>
              <Checkbox label="Share my location with the hospital" />
            </div>
          </Panel>
          <Panel title="Timeline and tabs">
            <Tabs label="Example tabs" value={tab} onChange={setTab} tabs={[{ id: 'a', label: 'Overview' }, { id: 'b', label: 'History' }]} />
            <div className="mt-3"><Timeline items={[{ id: 1, title: 'Alert sent', time: '10:02' }, { id: 2, title: 'Hospital accepted', time: '10:03' }, { id: 3, title: 'Ambulance dispatched', done: false }]} /></div>
          </Panel>
        </div>

        <Panel title="Table">
          <Table caption="Example fleet" rowKey={(r) => r.id} columns={[{ key: 'id', label: 'Ambulance' }, { key: 's', label: 'Status' }, { key: 'e', label: 'ETA', align: 'right' }]}
            rows={[{ id: 'AMB-1', s: 'Available', e: '–' }, { id: 'AMB-2', s: 'On a trip', e: '6 min' }]} />
        </Panel>

        <div className="grid gap-6 md:grid-cols-3">
          <Card><EmptyState title="No emergencies right now">New alerts show up here the moment they arrive.</EmptyState></Card>
          <Card className="space-y-2 p-4"><Skeleton className="h-5 w-2/3" /><Skeleton /><Skeleton className="h-16" /></Card>
          <div className="space-y-3"><ErrorState onRetry={() => {}}>The server did not answer. Check your connection.</ErrorState><Toast tone="low">Case accepted</Toast></div>
        </div>

        <Panel title="Dialog and tooltip">
          <div className="flex gap-3"><Button variant="danger" onClick={() => setOpen(true)}>Open dialog</Button><Tooltip text="Opens the alarm settings"><Button variant="secondary" icon="info">Hover or focus me</Button></Tooltip></div>
        </Panel>
        <Modal open={open} onClose={() => setOpen(false)} tone="danger" title="Restore backup?" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger">Restore</Button></>}>
          <p>This replaces current data. Type RESTORE to confirm.</p>
        </Modal>

        <Panel title="Icons"><div className="flex flex-wrap gap-4">{ICON_NAMES.map((n) => <span key={n} className="flex w-24 flex-col items-center gap-1 text-xs text-muted"><Icon name={n} size={24} className="text-ink" />{n}</span>)}</div></Panel>
        <div className="flex gap-6 text-sm"><span className="flex items-center gap-2"><EcgTrace state="live" />Connected</span><span className="flex items-center gap-2"><EcgTrace state="connecting" />Reconnecting</span><span className="flex items-center gap-2"><EcgTrace state="offline" />Offline</span></div>
      </div>
    </div>
  );
}
