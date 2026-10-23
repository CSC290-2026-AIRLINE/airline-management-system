import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/dashboard')({ component: () => <Navigate to="/account/my-profile" replace /> })
