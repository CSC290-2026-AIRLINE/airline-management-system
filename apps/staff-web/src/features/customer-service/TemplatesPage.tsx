import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Switch } from '@staff-web/components/ui/switch'
import { Textarea } from '@staff-web/components/ui/textarea'
import { cn } from '@staff-web/lib/utils'
import { useComplaintsApi } from './api'
import { ToneBadge } from './ComplaintBadges'
import { PageFrame } from './components/PageFrame'
import type { StaffTemplateItemView } from './types'

/* 10 / Staff / Templates (Figma 4032:16965). Shown until the database answers, and kept if it fails. */
const INITIAL_TEMPLATES: StaffTemplateItemView[] = [
  {
    code: 'flight_delayed',
    name: 'Flight delayed',
    feature: 'Feature 2',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: '✓',
    pushState: '✓',
    emailTitle: 'Your flight {{flight_number}} is delayed',
    emailBody:
      'Hi {{first_name}}, flight {{flight_number}} from {{origin}} to {{destination}} now leaves at {{new_time}} ({{delay}} late). Reason: {{reason}}.',
    smsBody: '{{flight_number}} now leaves {{new_time}} ({{delay}} late, {{reason}}). Sorry for the wait. Flython',
    pushTitle: '{{flight_number}} delayed',
    pushBody: 'Now leaving at {{new_time}} ({{delay}} late).',
  },
  {
    code: 'flight_rescheduled',
    name: 'Flight rescheduled',
    feature: 'Feature 2',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: '✓',
    pushState: '✓',
  },
  {
    code: 'flight_diverted',
    name: 'Flight diverted',
    feature: 'Feature 2',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: '✓',
    pushState: '!',
  },
  {
    code: 'flight_cancelled',
    name: 'Flight cancelled',
    feature: 'Feature 2',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: '✓',
    pushState: '✓',
  },
  {
    code: 'gate_changed',
    name: 'Gate changed',
    feature: 'Feature 6',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: '✓',
    pushState: '✓',
  },
  {
    code: 'security_alert',
    name: 'Security alert to the authority',
    feature: 'Feature 7',
    group: 'ALWAYS SENT',
    emailState: '✓',
    smsState: ' ',
    pushState: ' ',
  },
  {
    code: 'check_in_completed',
    name: 'Check-in completed',
    feature: 'Feature 6',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: ' ',
    pushState: '✓',
  },
  {
    code: 'boarding_pass_issued',
    name: 'Boarding pass issued',
    feature: 'Feature 6',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: ' ',
    pushState: '✓',
  },
  { code: 'boarding_call', name: 'Boarding call', feature: 'Feature 6', group: 'OPTIONAL', emailState: ' ', smsState: '✓', pushState: '✓' },
  {
    code: 'bag_case_updated',
    name: 'Lost bag case updated',
    feature: 'Feature 10',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '✓',
    pushState: '–',
  },
  {
    code: 'bag_delivery_updated',
    name: 'Bag delivery updated',
    feature: 'Feature 10',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '–',
    pushState: '✓',
  },
  {
    code: 'miles_expiring',
    name: 'Miles expiring',
    feature: 'Feature 11',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '✓',
    pushState: '✓',
  },
  { code: 'tier_changed', name: 'Tier changed', feature: 'Feature 11', group: 'OPTIONAL', emailState: '✓', smsState: '✓', pushState: '✓' },
  {
    code: 'complaint_received',
    name: 'Complaint received',
    feature: 'Feature 13',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '–',
    pushState: '–',
    emailTitle: 'We received your complaint {{case_number}}',
    emailBody: 'Hi {{first_name}}, we logged your {{complaint_type}} complaint under {{case_number}}. Our team will update you by email.',
    smsBody: 'Flython: Complaint {{case_number}} received.',
    pushTitle: 'Complaint {{case_number}} received',
    pushBody: 'We will notify you when a staff member updates your case.',
  },
  {
    code: 'complaint_updated',
    name: 'Complaint updated',
    feature: 'Feature 13',
    group: 'OPTIONAL',
    emailState: '✓',
    smsState: '–',
    pushState: '–',
    emailTitle: 'Update on your complaint {{case_number}}',
    emailBody: 'Hi {{first_name}}, your case {{case_number}} is now {{status}}.',
    smsBody: 'Flython: Case {{case_number}} is now {{status}}.',
    pushTitle: 'Case {{case_number}} updated',
    pushBody: 'Status changed to {{status}}.',
  },
]

type Channel = 'email' | 'sms' | 'push'
type ChannelState = StaffTemplateItemView['emailState']

const SOURCE_FEATURES = ['All features', 'Feature 2', 'Feature 6', 'Feature 7', 'Feature 10', 'Feature 11', 'Feature 13']

/** What a channel shows when the template has no text of its own yet. SMS has no subject line. */
const FALLBACK: Record<Channel, { subject?: string; body: string }> = {
  email: {
    subject: 'Your flight {{flight_number}} is delayed',
    body: 'Hi {{first_name}}, flight {{flight_number}} from {{origin}} to {{destination}} now leaves at {{new_time}} ({{delay}} late). Reason: {{reason}}.',
  },
  sms: { body: '{{flight_number}} now leaves {{new_time}} ({{delay}} late, {{reason}}). Sorry for the wait. Flython' },
  push: { subject: '{{flight_number}} delayed', body: 'Now leaving at {{new_time}} ({{delay}} late).' },
}

function savedText(t: StaffTemplateItemView, ch: Channel): { subject?: string; body: string } {
  if (ch === 'email') return { subject: t.emailTitle ?? FALLBACK.email.subject, body: t.emailBody ?? FALLBACK.email.body }
  if (ch === 'sms') return { body: t.smsBody ?? FALLBACK.sms.body }
  return { subject: t.pushTitle ?? FALLBACK.push.subject, body: t.pushBody ?? FALLBACK.push.body }
}

/** One channel in the message-type list: ✓ on, – off, ! missing template, grey = not used for that message. */
function ChannelMark({ state, label }: { state: ChannelState; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px]',
        state === '!' ? 'text-danger' : state === '✓' ? 'font-medium text-foreground' : 'text-muted-foreground/60',
      )}
    >
      {state !== ' ' && <strong className={state === '✓' ? 'text-success-strong' : undefined}>{state}</strong>}
      {label}
    </span>
  )
}

interface ChannelSectionProps {
  title: string
  /** Right of the title, before Edit: the "Always on" badge or the on/off switch. */
  control: ReactNode
  text: { subject?: string; body: string }
  editing: boolean
  draftSubject: string
  draftBody: string
  saving: boolean
  onDraftSubject: (value: string) => void
  onDraftBody: (value: string) => void
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}

function ChannelSection(props: ChannelSectionProps) {
  const { title, control, text, editing, draftSubject, draftBody, saving } = props
  const hasSubject = text.subject !== undefined
  return (
    <section className="flex flex-col gap-2.5 border-t pt-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-foreground">{title}</h3>
        <div className="flex items-center gap-2.5">
          {control}
          <span className="h-4 w-px bg-border" aria-hidden="true" />
          <Button variant="link" size="sm" className="h-auto px-0" onClick={props.onEdit}>
            Edit
          </Button>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2 rounded-lg bg-page p-3">
          {hasSubject && (
            <Input
              aria-label={`${title} subject`}
              value={draftSubject}
              onChange={(e) => props.onDraftSubject(e.target.value)}
              className="h-9 font-semibold"
            />
          )}
          <Textarea
            aria-label={`${title} message`}
            rows={title === 'Email' ? 3 : 2}
            value={draftBody}
            onChange={(e) => props.onDraftBody(e.target.value)}
            className="bg-card"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={props.onSave}>
              {saving ? 'Saving…' : 'Save to DB'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 rounded-lg bg-page px-3 py-2.5 text-[13px] text-foreground">
          {hasSubject && <div className="font-semibold">{text.subject}</div>}
          <div>{text.body}</div>
        </div>
      )}
    </section>
  )
}

export function TemplatesPage() {
  const api = useComplaintsApi()
  const [templates, setTemplates] = useState<StaffTemplateItemView[]>(INITIAL_TEMPLATES)
  const [selectedCode, setSelectedCode] = useState('flight_delayed')
  const [sourceFilter, setSourceFilter] = useState('All features')
  const [search, setSearch] = useState('')
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    api
      .getTemplates()
      .then((res) => {
        if (active && Array.isArray(res) && res.length > 0) {
          setTemplates(res)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const filtered = templates.filter((t) => {
    const matchSource = sourceFilter === 'All features' || t.feature === sourceFilter
    const matchQ =
      !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()) || t.code.includes(search.trim().toLowerCase())
    return matchSource && matchQ
  })

  const selected = templates.find((t) => t.code === selectedCode) ?? templates[0]

  async function toggleChannel(code: string, channelKey: 'smsState' | 'pushState') {
    const target = templates.find((t) => t.code === code)
    if (!target) return
    const nextActive = target[channelKey] !== '✓'
    const nextVal = nextActive ? '✓' : '–'
    setTemplates((prev) => prev.map((item) => (item.code === code ? { ...item, [channelKey]: nextVal } : item)))
    try {
      const updated = await api.updateTemplate(code, {
        channel: channelKey === 'smsState' ? 'sms' : 'push',
        isActive: nextActive,
      })
      if (Array.isArray(updated) && updated.length > 0) {
        setTemplates(updated)
      }
    } catch {
      // keep the optimistic toggle; the next load shows the saved state
    }
  }

  function startEdit(ch: Channel) {
    const text = savedText(selected, ch)
    setEditingChannel(ch)
    setDraftSubject(text.subject ?? '')
    setDraftBody(text.body)
  }

  async function saveEdit() {
    if (!editingChannel) return
    setSaving(true)
    const ch = editingChannel
    setTemplates((prev) =>
      prev.map((item) => {
        if (item.code !== selected.code) return item
        if (ch === 'email') return { ...item, emailTitle: draftSubject, emailBody: draftBody }
        if (ch === 'sms') return { ...item, smsBody: draftBody }
        return { ...item, pushTitle: draftSubject, pushBody: draftBody }
      }),
    )
    try {
      const updated = await api.updateTemplate(selected.code, {
        channel: ch,
        subjectTemplate: ch === 'sms' ? null : draftSubject,
        bodyTemplate: draftBody,
      })
      if (Array.isArray(updated) && updated.length > 0) {
        setTemplates(updated)
      }
    } catch {
      // keep the optimistic edit; the next load shows the saved state
    } finally {
      setSaving(false)
      setEditingChannel(null)
    }
  }

  function sectionProps(ch: Channel) {
    return {
      text: savedText(selected, ch),
      editing: editingChannel === ch,
      draftSubject,
      draftBody,
      saving,
      onDraftSubject: setDraftSubject,
      onDraftBody: setDraftBody,
      onEdit: () => startEdit(ch),
      onCancel: () => setEditingChannel(null),
      onSave: () => void saveEdit(),
    }
  }

  function channelSwitch(key: 'smsState' | 'pushState', label: string) {
    const on = selected[key] === '✓'
    return (
      <>
        <span className="text-[13px] font-medium text-foreground">{on ? 'On' : 'Off'}</span>
        <Switch
          aria-label={`${label} on or off`}
          checked={on}
          onCheckedChange={() => void toggleChannel(selected.code, key)}
          className="data-[state=checked]:bg-success-strong"
        />
      </>
    )
  }

  return (
    <PageFrame
      title="Templates"
      description={
        'One template per message type and channel; placeholders like {{flight_number}} are filled when a message is sent. Only the supervisor edits or switches templates.'
      }
    >
      <Card className="flex-row flex-wrap items-end gap-3.5 px-4 py-3.5 shadow-none">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-source" className="text-xs font-medium text-muted-foreground">
            Source feature
          </Label>
          <NativeSelect id="tpl-source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-10 w-48">
            {SOURCE_FEATURES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="tpl-search" className="text-xs font-medium text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="tpl-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type name or text in a template"
              className="h-10 pl-9"
            />
          </div>
        </div>
      </Card>

      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        <Card className="gap-0 overflow-hidden py-0 shadow-none lg:w-[430px] lg:shrink-0">
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No templates match the filters.</p>}
          {(['ALWAYS SENT', 'OPTIONAL'] as const).map((grp) => {
            const items = filtered.filter((t) => t.group === grp)
            if (items.length === 0) return null
            return (
              <div key={grp} className="border-t first:border-t-0">
                <div className="bg-page px-4 pt-2.5 pb-2">
                  <h2 className="text-[11px] font-bold tracking-wide text-foreground">{grp}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {grp === 'ALWAYS SENT' ? 'Email can’t be switched off. SMS and push can.' : 'Every channel can be switched on or off.'}
                  </p>
                </div>
                <ul className="m-0 list-none p-0">
                  {items.map((item) => {
                    const active = item.code === selected.code
                    return (
                      <li key={item.code}>
                        <button
                          type="button"
                          aria-current={active ? 'true' : undefined}
                          onClick={() => {
                            setSelectedCode(item.code)
                            setEditingChannel(null)
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2.5 border-t border-l-[3px] px-4 py-3 text-left outline-none focus-visible:bg-muted',
                            active ? 'border-l-blue-600 bg-blue-50' : 'border-l-transparent bg-card hover:bg-muted/50',
                          )}
                        >
                          <span className="flex flex-col">
                            <span className="text-[13px] font-semibold text-foreground">{item.name}</span>
                            <span className="text-[11px] text-muted-foreground">{item.feature}</span>
                          </span>
                          <span className="flex items-center gap-2.5">
                            <ChannelMark state={item.emailState} label="Email" />
                            <ChannelMark state={item.smsState} label="SMS" />
                            <ChannelMark state={item.pushState} label="Push" />
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
          <p className="border-t px-4 py-2.5 text-[11px] text-muted-foreground">
            ✓ on – off ! missing template grey = not used for that message
          </p>
        </Card>

        <Card className="min-w-0 flex-1 gap-4 px-6 py-5 shadow-none">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-bold text-foreground">{selected.name}</h2>
            <p className="text-[13px] text-muted-foreground">
              {selected.code} · from {selected.feature}
            </p>
          </div>
          <ChannelSection title="Email" control={<ToneBadge tone="info">Always on</ToneBadge>} {...sectionProps('email')} />
          <ChannelSection title="SMS" control={channelSwitch('smsState', 'SMS')} {...sectionProps('sms')} />
          <ChannelSection title="Push" control={channelSwitch('pushState', 'Push')} {...sectionProps('push')} />
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Every change is saved with the staff member in PostgreSQL (`notification_template`) and sent to the Feature 15 audit log.
        Switched-off templates are skipped and show as Skipped in the delivery log.
      </p>
    </PageFrame>
  )
}
