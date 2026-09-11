import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { MenuService } from './menu.service';
import { MenuDto } from '@core/models/menu-dto.model';

const RID = 'r-1';

function dto(partial: Partial<MenuDto> = {}): MenuDto {
  return {
    restaurantId: RID,
    mode: 'none',
    manual: {},
    files: [],
    limits: { pdfMaxBytes: 10 * 1024 * 1024, imageMaxBytes: 5 * 1024 * 1024, imageMaxCount: 8 },
    ...partial,
  };
}

function pngFile(size = 64): File {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return new File([bytes], 'carte.png', { type: 'image/png' });
}

describe('MenuService', () => {
  let service: MenuService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MenuService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('load : GET /restaurants/{id}/menu et expose le menu mappe', () => {
    service.load(RID);
    const req = http.expectOne((r) => r.url.endsWith(`/restaurants/${RID}/menu`));
    expect(req.request.method).toBe('GET');
    expect(service.loading()).toBe(true);
    req.flush(
      dto({ mode: 'manual', manual: { version: 1, sections: [{ name: 'Plats', items: [] }] } }),
    );

    expect(service.loading()).toBe(false);
    expect(service.menu()?.mode).toBe('manual');
    expect(service.menu()?.manual.sections[0].name).toBe('Plats');
  });

  it('load : un document de saisie inattendu devient un menu vide, pas une erreur', () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto({ manual: 'n importe quoi' }));
    expect(service.error()).toBe(false);
    expect(service.menu()?.manual.sections).toEqual([]);
  });

  it('load : une erreur reseau passe error a true et loading a false', () => {
    service.load(RID);
    http.expectOne(() => true).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(service.error()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('setMode : PUT avec le mode seul, jamais de manual (le back garde la saisie)', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto());

    const promise = firstValueFrom(service.setMode('images'));
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body).toEqual({ mode: 'images' });
    req.flush(dto({ mode: 'images' }));

    await promise;
    expect(service.menu()?.mode).toBe('images');
  });

  it('setMode : un 409 mode_not_ready devient un message francais', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto());

    const promise = firstValueFrom(service.setMode('pdf'));
    http
      .expectOne((r) => r.method === 'PUT')
      .flush({ error: 'mode_not_ready' }, { status: 409, statusText: 'Conflict' });

    await expect(promise).rejects.toThrow(/contenu/);
    expect(service.lastError()).toMatch(/contenu/);
    expect(service.saveState()).toBe('saved');
  });

  it('saveManual : PUT avec le mode courant et le document', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto({ mode: 'manual' }));

    const manual = {
      version: 1 as const,
      sections: [{ name: 'Plats', items: [{ name: 'Tajine', description: '', price: '18.00' }] }],
    };
    const promise = firstValueFrom(service.saveManual(manual));
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body).toEqual({ mode: 'manual', manual });
    req.flush(dto({ mode: 'manual', manual }));

    await promise;
    expect(service.saveState()).toBe('saved');
  });

  it('scheduleManualSave : dirty puis, apres 600 ms, saving puis saved', async () => {
    vi.useFakeTimers();
    try {
      service.load(RID);
      http.expectOne(() => true).flush(dto({ mode: 'manual' }));
      const manual = { version: 1 as const, sections: [{ name: 'Plats', items: [] }] };

      service.scheduleManualSave(manual);
      expect(service.saveState()).toBe('dirty');
      http.expectNone((r) => r.method === 'PUT');

      vi.advanceTimersByTime(600);
      const req = http.expectOne((r) => r.method === 'PUT');
      expect(service.saveState()).toBe('saving');
      req.flush(dto({ mode: 'manual', manual }));
      expect(service.saveState()).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('saveManual apres scheduleManualSave : un seul PUT, l autosave est desarme', async () => {
    vi.useFakeTimers();
    try {
      service.load(RID);
      http.expectOne(() => true).flush(dto({ mode: 'manual' }));
      const manual = { version: 1 as const, sections: [{ name: 'Plats', items: [] }] };
      service.scheduleManualSave(manual);
      const promise = firstValueFrom(service.saveManual(manual));
      http.expectOne((r) => r.method === 'PUT').flush(dto({ mode: 'manual', manual }));
      await promise;
      vi.advanceTimersByTime(1000);
      http.expectNone((r) => r.method === 'PUT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('setMode avec une saisie en attente : un seul PUT qui porte le mode et le document', async () => {
    vi.useFakeTimers();
    try {
      service.load(RID);
      http.expectOne(() => true).flush(dto({ mode: 'none' }));
      const manual = { version: 1 as const, sections: [{ name: 'Plats', items: [] }] };
      service.scheduleManualSave(manual);

      const promise = firstValueFrom(service.setMode('manual'));
      const req = http.expectOne((r) => r.method === 'PUT');
      expect(req.request.body).toEqual({ mode: 'manual', manual });
      req.flush(dto({ mode: 'manual', manual }));
      await promise;
      vi.advanceTimersByTime(1000);
      http.expectNone((r) => r.method === 'PUT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('saveManual : une saisie videe alors qu elle est publiee depublie au lieu d echouer', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto({ mode: 'manual' }));
    const empty = { version: 1 as const, sections: [] };

    const promise = firstValueFrom(service.saveManual(empty));
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body).toEqual({ mode: 'none', manual: empty });
    req.flush(dto({ mode: 'none' }));
    await promise;
  });

  it('flushManualSave : la saisie en attente part tout de suite', () => {
    vi.useFakeTimers();
    try {
      service.load(RID);
      http.expectOne(() => true).flush(dto({ mode: 'manual' }));
      const manual = { version: 1 as const, sections: [{ name: 'Plats', items: [] }] };
      service.scheduleManualSave(manual);
      http.expectNone((r) => r.method === 'PUT');

      service.flushManualSave();
      http.expectOne((r) => r.method === 'PUT').flush(dto({ mode: 'manual', manual }));
      vi.advanceTimersByTime(1000);
      http.expectNone((r) => r.method === 'PUT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('scheduleManualSave : une erreur passe en failed avec un message', () => {
    vi.useFakeTimers();
    try {
      service.load(RID);
      http.expectOne(() => true).flush(dto({ mode: 'manual' }));
      service.scheduleManualSave({ version: 1, sections: [] });
      vi.advanceTimersByTime(600);
      http
        .expectOne((r) => r.method === 'PUT')
        .flush({ error: 'invalid_manual' }, { status: 400, statusText: 'Bad Request' });
      expect(service.saveState()).toBe('failed');
      expect(service.lastError()).toMatch(/mal formé/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('upload : refuse un SVG cote client, sans aucun appel HTTP', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto());
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], 'x.svg', {
      type: 'image/svg+xml',
    });

    await expect(firstValueFrom(service.upload(svg))).rejects.toThrow(/PDF, JPEG, PNG et WebP/);
    http.expectNone((r) => r.method === 'POST');
  });

  it('upload : refuse une image de plus de 5 Mo cote client', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto());

    await expect(firstValueFrom(service.upload(pngFile(5 * 1024 * 1024 + 1)))).rejects.toThrow(
      /volumineux/,
    );
    http.expectNone((r) => r.method === 'POST');
  });

  it('upload : refuse une 9e image cote client', async () => {
    service.load(RID);
    const eight = Array.from({ length: 8 }, (_, i) => ({
      id: `f${i}`,
      kind: 'image' as const,
      contentType: 'image/png',
      position: i,
      sizeBytes: 1,
      url: `/u/${i}`,
    }));
    http.expectOne(() => true).flush(dto({ files: eight }));

    await expect(firstValueFrom(service.upload(pngFile()))).rejects.toThrow(/8 images/);
    http.expectNone((r) => r.method === 'POST');
  });

  it('upload : un PNG valide part en multipart dans le champ file', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto());

    const promise = firstValueFrom(service.upload(pngFile()));
    const req = await vi.waitFor(() => http.expectOne((r) => r.method === 'POST'));
    expect(req.request.url).toContain(`/restaurants/${RID}/menu/files`);
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBeInstanceOf(File);
    req.flush(
      dto({
        files: [
          {
            id: 'f1',
            kind: 'image',
            contentType: 'image/png',
            position: 0,
            sizeBytes: 64,
            url: '/api/restaurants/r-1/menu/files/f1',
          },
        ],
      }),
    );

    await promise;
    expect(service.menu()?.files).toHaveLength(1);
  });

  it('getPublic : GET /public/restaurants/{id}/menu sans toucher l etat admin', async () => {
    const promise = firstValueFrom(service.getPublic(RID));
    const req = http.expectOne((r) => r.url.endsWith(`/public/restaurants/${RID}/menu`));
    expect(req.request.method).toBe('GET');
    req.flush({
      restaurantName: 'Chez Hikky',
      mode: 'images',
      manual: null,
      files: [
        {
          id: 'f1',
          kind: 'image',
          contentType: 'image/png',
          position: 0,
          sizeBytes: 1,
          url: `/api/public/restaurants/${RID}/menu/files/f1`,
        },
      ],
    });
    const menu = await promise;
    expect(menu.restaurantName).toBe('Chez Hikky');
    expect(menu.files[0].url).toContain('/api/public/');
    expect(service.menu()).toBeNull();
  });

  it('removeFile et reorder : DELETE puis PUT files/order avec la liste', async () => {
    service.load(RID);
    http.expectOne(() => true).flush(dto());

    const del = firstValueFrom(service.removeFile('f1'));
    const delReq = http.expectOne((r) => r.method === 'DELETE');
    expect(delReq.request.url).toContain('/menu/files/f1');
    delReq.flush(dto());
    await del;

    const order = firstValueFrom(service.reorder(['b', 'a']));
    const orderReq = http.expectOne((r) => r.method === 'PUT' && r.url.endsWith('/files/order'));
    expect(orderReq.request.body).toEqual({ fileIds: ['b', 'a'] });
    orderReq.flush(dto());
    await order;
  });
});
