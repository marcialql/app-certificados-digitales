import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import App from './App';

it('muestra los tres botones principales', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Firmar un documento' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Qué puedo hacer?' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Avisos' })).toBeTruthy();
});
