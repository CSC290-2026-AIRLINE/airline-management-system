import { createFileRoute } from '@tanstack/react-router';
import { ReadinessPage } from '../../pages/ReadinessPage';

export const Route = createFileRoute('/_authenticated/readiness')({
  component: ReadinessPage,
});