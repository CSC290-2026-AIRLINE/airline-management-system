import { createFileRoute } from '@tanstack/react-router';
import { AircraftManagementPage } from '../../pages/AircraftManagementPage';

export const Route = createFileRoute('/_authenticated/aircraft')({
  component: AircraftManagementPage,
});