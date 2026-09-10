import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APIRequestContext, Page, expect } from '@playwright/test';

const API = process.env['E2E_API_URL'] ?? 'http://localhost:8080/api';

export interface Owner {
  email: string;
  password: string;
  token: string;
  restaurantId: string;
  restaurantName: string;
}

// Un compte et un restaurant neufs par test : aucun test ne depend d'un autre.
export async function createOwner(request: APIRequestContext, label: string): Promise<Owner> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `e2e-${label}-${stamp}@example.com`;
  const password = 'password123';
  const reg = await request.post(`${API}/auth/register`, { data: { email, password } });
  expect(reg.ok()).toBeTruthy();
  const token = (await reg.json()).accessToken as string;
  const me = await request.get(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } });
  const organizationId = (await me.json()).organizationId as string;
  const restaurantName = `Chez E2E ${label}`;
  const resto = await request.post(`${API}/restaurants`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      organizationId,
      name: restaurantName,
      phoneNumber: `+331${stamp.replace(/\D/g, '').slice(-8).padStart(8, '0')}`,
    },
  });
  expect(resto.ok()).toBeTruthy();
  return { email, password, token, restaurantId: (await resto.json()).id, restaurantName };
}

export async function login(page: Page, owner: Owner): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /e-mail/i }).fill(owner.email);
  await page.getByRole('textbox', { name: /mot de passe/i }).fill(owner.password);
  await page.getByRole('button', { name: /se connecter/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export function fixture(name: string): string {
  return join(__dirname, 'fixtures', name);
}

export function fixtureBytes(name: string): Buffer {
  return readFileSync(fixture(name));
}

export async function apiPut(request: APIRequestContext, owner: Owner, body: unknown) {
  return request.put(`${API}/restaurants/${owner.restaurantId}/menu`, {
    headers: { Authorization: `Bearer ${owner.token}` },
    data: body,
  });
}

// Un PNG valide en tete mais trop gros : genere a la volee, jamais versionne.
export function oversizedPng(): { name: string; mimeType: string; buffer: Buffer } {
  const head = fixtureBytes('photo-1.png');
  return {
    name: 'trop-gros.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([head, Buffer.alloc(5 * 1024 * 1024)]),
  };
}
