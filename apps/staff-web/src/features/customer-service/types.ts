// Shared complaint types — mirrored in customer-web/src/features/customer-service/types.ts
// When the backend is ready, replace localStorage calls with API calls.

export type ComplaintCategory = 'Employee' | 'Flight' | 'Food'

export type ComplaintStatus =
  | 'Pending'
  | 'In Review'
  | 'Escalated'
  | 'Resolved'
  | 'Closed'

export interface ComplaintNote {
  id: string
  author: string // staff name / 'system'
  content: string
  createdAt: string // ISO string
  isInternal: boolean
}

export interface Complaint {
  id: string // e.g. CS-2026-00001
  category: ComplaintCategory
  subject: string
  description: string
  // Booking & flight info
  bookingRef: string
  flightNumber: string
  flightDate: string
  // Passenger info
  passengerName: string
  passengerEmail: string
  // Status management
  status: ComplaintStatus
  assignedTo: string | null
  supervisorInvolved: boolean
  // Timeline
  submittedAt: string // ISO string
  updatedAt: string // ISO string
  notes: ComplaintNote[]
}

// ─────────────────────────────────────────────
// LocalStorage helpers shared across both apps
// ─────────────────────────────────────────────
const STORAGE_KEY = 'cs_complaints'

export function loadComplaints(): Complaint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Complaint[]
  } catch {
    return []
  }
}

export function saveComplaints(complaints: Complaint[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(complaints))
}

export function addComplaint(complaint: Complaint): void {
  const list = loadComplaints()
  list.unshift(complaint) // newest first
  saveComplaints(list)
}

export function updateComplaint(updated: Complaint): void {
  const list = loadComplaints()
  const idx = list.findIndex((c) => c.id === updated.id)
  if (idx !== -1) {
    list[idx] = updated
    saveComplaints(list)
  }
}

export function generateCaseId(): string {
  const year = new Date().getFullYear()
  const existing = loadComplaints()
  const num = existing.length + 1
  return `CS-${year}-${String(num).padStart(5, '0')}`
}

export const STATUS_COLORS: Record<ComplaintStatus, { bg: string; text: string; border: string }> = {
  Pending: { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  'In Review': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  Escalated: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  Resolved: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  Closed: { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' },
}

export const CATEGORY_ICONS: Record<ComplaintCategory, string> = {
  Employee: '👤',
  Flight: '✈️',
  Food: '🍽️',
}
