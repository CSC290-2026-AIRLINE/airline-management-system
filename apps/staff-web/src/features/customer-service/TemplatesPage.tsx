import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Switch } from '@staff-web/components/ui/switch'
import { Textarea } from '@staff-web/components/ui/textarea'
import { cn } from '@staff-web/lib/utils'
import { errorMessage, useComplaintsApi } from './api'
import { ToneBadge } from './ComplaintBadges'
import { PageFrame } from './components/PageFrame'
import type { StaffTemplateItemView } from './types'

/* 10 / Staff / Templates (Figma 4032:16965). Loaded from the database; a failed load shows PageError. */
type Channel = 'email' | 'sms' | 'push'
type ChannelState = StaffTemplateItemView['emailState']

const ALL_FEATURES = 'All features'
/** Email needs a subject, a push title is optional, SMS has none. */
const HAS_SUBJECT: Record<Channel, boolean> = { email: true, sms: false, push: true }

/** The saved text for a channel, or null when the type has no template for it yet. */
function savedText(t: StaffTemplateItemView, ch: Channel): { subject?: string; body: string } | null {
  if (ch === 'email') return t.emailBody === undefined ? null : { subject: t.emailTitle, body: t.emailBody }
  if (ch === 'sms') return t.smsBody === undefined ? null : { body: t.smsBody }
  return t.pushBody === undefined ? null : { subject: t.pushTitle, body: t.pushBody }
}

/** The "Feature n" values present in the data, in feature-number order. */
function sourceFeatures(templates: StaffTemplateItemView[]): string[] {
  const features = [...new Set(templates.map((t) => t.feature))]
  return features.sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
}

/** {{names}} in the text that the message type does not fill. Matches the backend's INVALID_PLACEHOLDER check. */
function unknownPlaceholders(text: string, allowed: string[]): string[] {
  const used = [...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1])
  return [...new Set(used.filter((name) => !allowed.includes(name)))]
}

/** Why the draft cannot be saved yet, or null when it can. The backend checks the same rules. */
function draftProblem(ch: Channel, subject: string, body: string, allowed: string[]): string | null {
  if (ch === 'email' && !subject.trim()) return 'An email needs a subject.'
  if (!body.trim()) return 'The message cannot be empty.'
  const unknown = unknownPlaceholders(`${subject}\n${body}`, allowed)
  if (unknown.length > 0) return `Not a placeholder for this message: ${unknown.map((n) => `{{${n}}}`).join(', ')}`
  return null
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
  channel: Channel
  /** Right of the title, before Edit: the "Always on" badge or the on/off switch. */
  control: ReactNode
  /** null when the type has no template for this channel yet. */
  text: { subject?: string; body: string } | null
  hasSubject: boolean
  placeholders: string[]
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
  const { title, control, text, hasSubject, placeholders, editing, draftSubject, draftBody, saving } = props
  const problem = editing ? draftProblem(props.channel, draftSubject, draftBody, placeholders) : null
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
              placeholder={title === 'Email' ? 'Subject' : 'Title (optional)'}
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
          <p className="text-[11px] text-muted-foreground">
            Placeholders: {placeholders.length > 0 ? placeholders.map((n) => `{{${n}}}`).join(' ') : 'none for this message'}
          </p>
          {problem && <p className="text-[11px] text-danger">{problem}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving || problem !== null} onClick={props.onSave}>
              {saving ? 'Saving…' : 'Save to DB'}
            </Button>
          </div>
        </div>
      ) : text === null ? (
        <div className="rounded-lg bg-page px-3 py-2.5 text-[13px] text-danger">
          <strong>!</strong> No template yet
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 rounded-lg bg-page px-3 py-2.5 text-[13px] text-foreground">
          {hasSubject && text.subject && <div className="font-semibold">{text.subject}</div>}
          <div>{text.body}</div>
        </div>
      )}
    </section>
  )
}

export function TemplatesPage() {
  const api = useComplaintsApi()
  const [templates, setTemplates] = useState<StaffTemplateItemView[] | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedCode, setSelectedCode] = useState('flight_delayed')
  const [sourceFilter, setSourceFilter] = useState(ALL_FEATURES)
  const [search, setSearch] = useState('')
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchTemplates = useEffectEvent(() => api.getTemplates())

  useEffect(() => {
    let active = true
    fetchTemplates()
      .then((res) => {
        if (active) setTemplates(res)
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e)
      })
    return () => {
      active = false
    }
  }, [])

  // Rethrown during render so the route's PageError shows it; "Try again" remounts and refetches.
  if (loadError) throw loadError
  if (templates === null || templates.length === 0) {
    return (
      <PageFrame title="Templates" description="One template per message type and channel.">
        <p className="text-sm text-muted-foreground">
          {templates === null ? 'Loading templates…' : 'No notification types are set up yet.'}
        </p>
      </PageFrame>
    )
  }
  // A non-null name the handlers below can close over (TypeScript does not narrow `templates` inside them).
  const loaded = templates

  const filtered = loaded.filter((t) => {
    const matchSource = sourceFilter === ALL_FEATURES || t.feature === sourceFilter
    const matchQ =
      !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase()) || t.code.includes(search.trim().toLowerCase())
    return matchSource && matchQ
  })

  const selected = loaded.find((t) => t.code === selectedCode) ?? loaded[0]

  async function toggleChannel(code: string, channelKey: 'smsState' | 'pushState') {
    const target = loaded.find((t) => t.code === code)
    if (!target) return
    const nextActive = target[channelKey] !== '✓'
    const nextVal = nextActive ? '✓' : '–'
    const before = loaded
    setSaveError(null)
    setTemplates(before.map((item) => (item.code === code ? { ...item, [channelKey]: nextVal } : item)))
    try {
      const updated = await api.updateTemplate(code, {
        channel: channelKey === 'smsState' ? 'sms' : 'push',
        isActive: nextActive,
      })
      setTemplates(updated)
    } catch (e) {
      setTemplates(before)
      setSaveError(errorMessage(e))
    }
  }

  function startEdit(ch: Channel) {
    const text = savedText(selected, ch)
    setEditingChannel(ch)
    setDraftSubject(text?.subject ?? '')
    setDraftBody(text?.body ?? '')
  }

  async function saveEdit() {
    if (!editingChannel) return
    setSaving(true)
    const ch = editingChannel
    const before = loaded
    setSaveError(null)
    setTemplates(
      before.map((item) => {
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
      setTemplates(updated)
    } catch (e) {
      setTemplates(before)
      setSaveError(errorMessage(e))
    } finally {
      setSaving(false)
      setEditingChannel(null)
    }
  }

  function sectionProps(ch: Channel) {
    return {
      channel: ch,
      text: savedText(selected, ch),
      hasSubject: HAS_SUBJECT[ch],
      placeholders: selected.placeholders,
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
    // A missing template has nothing to switch on; write it with Edit first.
    const missing = selected[key] === '!'
    return (
      <>
        <span className="text-[13px] font-medium text-foreground">{missing ? 'No template' : on ? 'On' : 'Off'}</span>
        <Switch
          aria-label={`${label} on or off`}
          checked={on}
          disabled={missing}
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
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>Could not save the template: {saveError}</AlertDescription>
        </Alert>
      )}
      <Card className="flex-row flex-wrap items-end gap-3.5 px-4 py-3.5 shadow-none">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tpl-source" className="text-xs font-medium text-muted-foreground">
            Source feature
          </Label>
          <NativeSelect id="tpl-source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-10 w-48">
            {[ALL_FEATURES, ...sourceFeatures(loaded)].map((f) => (
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
