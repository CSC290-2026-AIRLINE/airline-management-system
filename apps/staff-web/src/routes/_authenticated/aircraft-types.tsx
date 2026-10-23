import { createFileRoute } from '@tanstack/react-router';
import { AircraftTypesPage } from '../../pages/AircraftTypesPage';

export const Route = createFileRoute('/_authenticated/aircraft-types')({
  component: AircraftTypesPage,
});