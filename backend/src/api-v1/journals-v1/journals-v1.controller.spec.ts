import { Test, TestingModule } from '@nestjs/testing';
import { JournalsV1Controller } from './journals-v1.controller';
import { JournalService } from '../../journal/journal.service';
import { IntegrationLogService } from '../../integration-log/integration-log.service';
import { ApiKeyGuard } from '../../auth/api-key.guard';
import { IntegrationLogInterceptor } from '../integration-log.interceptor';

describe('JournalsV1Controller (Backward Compatibility)', () => {
  let controller: JournalsV1Controller;
  let journalService: Partial<JournalService>;
  let logService: Partial<IntegrationLogService>;

  beforeEach(async () => {
    journalService = {
      createExternal: jest.fn().mockResolvedValue({ id: 'test-id' }),
    };
    logService = {} as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JournalsV1Controller],
      providers: [
        { provide: JournalService, useValue: journalService },
        { provide: IntegrationLogService, useValue: logService },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(IntegrationLogInterceptor)
      .useValue({ intercept: (context, next) => next.handle() })
      .compile();

    controller = module.get<JournalsV1Controller>(JournalsV1Controller);
  });

  it('should accept V1 payload without dimensions field (backward compatibility)', async () => {
    const payload = {
      tanggal: '2023-01-01',
      deskripsi: 'Test Old Payload',
      sumber_aplikasi: 'Test',
      items: [
        { kode_akun: '1-1001', debit: 1000, kredit: 0 },
        { kode_akun: '4-1001', debit: 0, kredit: 1000 },
      ],
    };

    const req = { tenantId: 'tenant-1', apiKey: 'test-key', apiKeyLabel: 'test-app' } as any;

    const result = await controller.createExternalJournal(req, payload as any);

    expect(journalService.createExternal).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        tanggal: payload.tanggal,
        deskripsi: payload.deskripsi,
        entries: expect.arrayContaining([
          expect.objectContaining({ kode_akun: '1-1001', tipe: 'DEBIT', jumlah: 1000 }),
        ]),
      })
    );
    expect(result).toBeDefined();
  });

  it('should accept V2 payload with dimensions field', async () => {
    const payload = {
      tanggal: '2023-01-01',
      deskripsi: 'Test New Payload',
      sumber_aplikasi: 'Test',
      items: [
        {
          kode_akun: '1-1001',
          debit: 1000,
          kredit: 0,
          dimensions: [{ nama_dimension: 'Project', kode_value: 'PRJ01' }],
        },
        { kode_akun: '4-1001', debit: 0, kredit: 1000 },
      ],
    };

    const req = { tenantId: 'tenant-1', apiKey: 'test-key', apiKeyLabel: 'test-app' } as any;

    const result = await controller.createExternalJournal(req, payload as any);

    expect(journalService.createExternal).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            kode_akun: '1-1001',
            dimensions: [{ nama_dimension: 'Project', kode_value: 'PRJ01' }],
          }),
        ]),
      })
    );
    expect(result).toBeDefined();
  });
});
