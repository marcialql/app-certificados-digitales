import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import App from './App';

it('muestra los tres botones principales', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Firmar PDF' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sedes electrónicas' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Avisos' })).toBeTruthy();
});
