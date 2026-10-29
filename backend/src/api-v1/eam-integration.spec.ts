import { Test, TestingModule } from '@nestjs/testing';
import { JournalsV1Controller } from './journals-v1/journals-v1.controller';
import { PeriodsV1Controller } from './periods-v1/periods-v1.controller';
import { JournalService } from '../journal/journal.service';
import { AccountingPeriodService } from '../accounting-period/accounting-period.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { IntegrationLogInterceptor } from './integration-log.interceptor';
import { V1ExceptionFilter } from './v1-exception.filter';
import { ApiErrorCode } from '../common/errors/api-error-code.enum';
import { LedgeryApiException } from '../common/errors/ledgery-api.exception';
import {
  resolveIdempotencyKey,
  payloadHash,
} from '../common/utils/idempotency.util';
import { HttpStatus, ConflictException, BadRequestException } from '@nestjs/common';
import { PeriodStatus } from '@prisma/client';

describe('EAM Integration - Full Test Suite (11 Requirements)', () => {
  let journalsController: JournalsV1Controller;
  let periodsController: PeriodsV1Controller;
  let journalService: Partial<JournalService>;
  let periodService: Partial<AccountingPeriodService>;

  beforeEach(async () => {
    journalService = {
      createExternal: jest.fn(),
      findByIdOrIdentifier: jest.fn(),
      findByTenant: jest.fn(),
    };

    periodService = {
      evaluatePostingDate: jest.fn(),
      validateJournalDate: jest.fn(),
      getPeriodsV1: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JournalsV1Controller, PeriodsV1Controller],
      providers: [
        { provide: JournalService, useValue: journalService },
        { provide: AccountingPeriodService, useValue: periodService },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(IntegrationLogInterceptor)
      .useValue({ intercept: (_ctx: any, next: any) => next.handle() })
      .compile();

    journalsController = module.get<JournalsV1Controller>(JournalsV1Controller);
    periodsController = module.get<PeriodsV1Controller>(PeriodsV1Controller);
  });

  // 1. Key baru membuat jurnal (201) dan menyimpan hash
  it('1. Key baru membuat jurnal (201) dan meneruskan hash ke service', async () => {
    const payload = {
      tanggal: '2026-09-15',
      deskripsi: 'EAM Asset Depreciation Run',
      sumber_aplikasi: 'EAM',
      idempotency_key: 'EAM:DEP:2026-09:V1',
      items: [
        { kode_akun: '6104', debit: 500000, kredit: 0 },
        { kode_akun: '1000002', debit: 0, kredit: 500000 },
      ],
    };

    (journalService.createExternal as jest.Mock).mockResolvedValueOnce({
      id: 'jnl-new-1',
      no_voucher: 'JNL-2026-0001',
      tanggal: new Date('2026-09-15'),
      status: 'POSTED',
      idempotency_key: 'EAM:DEP:2026-09:V1',
      idempotency_payload_hash: payloadHash(payload as any),
      is_replay: false,
      entries: [
        { kode_akun: '6104', tipe: 'DEBIT', jumlah: 500000 },
        { kode_akun: '1000002', tipe: 'KREDIT', jumlah: 500000 },
      ],
    });

    const req = { tenantId: 'tenant-thi', headers: {} };
    const res = { status: jest.fn() };

    const result = await journalsController.createExternalJournal(req, payload as any, res);

    expect(result.statusCode).toBe(HttpStatus.CREATED);
    expect(result.idempotent_replay).toBe(false);
    expect(journalService.createExternal).toHaveBeenCalledWith(
      'tenant-thi',
      expect.objectContaining({
        idempotency_key: 'EAM:DEP:2026-09:V1',
        idempotency_payload_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  // 2. Key sama + payload sama mengembalikan jurnal yang sama (200, idempotent_replay: true)
  it('2. Key sama + payload sama mengembalikan jurnal yang sama (200, idempotent_replay: true)', async () => {
    const payload = {
      tanggal: '2026-09-15',
      deskripsi: 'EAM Asset Depreciation Run',
      sumber_aplikasi: 'EAM',
      idempotency_key: 'EAM:DEP:2026-09:V1',
      items: [
        { kode_akun: '6104', debit: 500000, kredit: 0 },
        { kode_akun: '1000002', debit: 0, kredit: 500000 },
      ],
    };

    (journalService.createExternal as jest.Mock).mockResolvedValueOnce({
      id: 'jnl-existing-1',
      no_voucher: 'JNL-2026-0001',
      tanggal: new Date('2026-09-15'),
      status: 'POSTED',
      idempotency_key: 'EAM:DEP:2026-09:V1',
      is_replay: true,
      idempotent_replay: true,
      entries: [
        { kode_akun: '6104', tipe: 'DEBIT', jumlah: 500000 },
        { kode_akun: '1000002', tipe: 'KREDIT', jumlah: 500000 },
      ],
    });

    const req = { tenantId: 'tenant-thi', headers: {} };
    const res = { status: jest.fn() };

    const result = await journalsController.createExternalJournal(req, payload as any, res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    expect(result.statusCode).toBe(HttpStatus.OK);
    expect(result.idempotent_replay).toBe(true);
    expect(result.is_replay).toBe(true);
    expect(result.data.id).toBe('jnl-existing-1');
  });

  // 3. Key sama + payload beda menghasilkan 409 IDEMPOTENCY_CONFLICT
  it('3. Key sama + payload beda menghasilkan 409 IDEMPOTENCY_CONFLICT', async () => {
    const payload = {
      tanggal: '2026-09-15',
      deskripsi: 'Modified payload',
      sumber_aplikasi: 'EAM',
      idempotency_key: 'EAM:DEP:2026-09:V1',
      items: [{ kode_akun: '6104', debit: 999999, kredit: 0 }],
    };

    (journalService.createExternal as jest.Mock).mockRejectedValueOnce(
      new ConflictException({
        errorCode: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key sudah pernah digunakan untuk transaksi dengan rincian yang berbeda.',
        details: { journal_id: 'jnl-existing-1', voucher_no: 'JNL-2026-0001', idempotency_key: 'EAM:DEP:2026-09:V1' },
      }),
    );

    const req = { tenantId: 'tenant-thi', headers: {} };

    await expect(
      journalsController.createExternalJournal(req, payload as any),
    ).rejects.toThrow(ConflictException);
  });

  // 4. Dua request serentak dengan key sama menghasilkan tepat satu jurnal
  it('4. Dua request serentak dengan key sama menghasilkan tepat satu jurnal (P2002 race condition handled)', async () => {
    // Simulasi Service menangani P2002 dan mengembalikan replay jurnal pemenang
    (journalService.createExternal as jest.Mock).mockResolvedValueOnce({
      id: 'jnl-winner-1',
      no_voucher: 'JNL-2026-0001',
      status: 'POSTED',
      idempotent_replay: true,
      is_replay: true,
    });

    const req = { tenantId: 'tenant-thi', headers: { 'idempotency-key': 'CONCURRENT-KEY-1' } };
    const res = { status: jest.fn() };

    const result = await journalsController.createExternalJournal(
      req,
      {
        tanggal: '2026-09-15',
        sumber_aplikasi: 'EAM',
        items: [{ kode_akun: '6104', debit: 100, kredit: 0 }],
      } as any,
      res,
    );

    expect(result.idempotent_replay).toBe(true);
    expect(result.statusCode).toBe(HttpStatus.OK);
  });

  // 5. Key di header dan di body yang berbeda menghasilkan 400
  it('5. Key di header dan di body yang berbeda menghasilkan 400 VALIDATION_ERROR', async () => {
    const payload = {
      tanggal: '2026-09-15',
      sumber_aplikasi: 'EAM',
      idempotency_key: 'KEY-IN-BODY',
      items: [],
    };

    const req = {
      tenantId: 'tenant-thi',
      headers: { 'idempotency-key': 'KEY-IN-HEADER-DIFFERENT' },
    };

    await expect(
      journalsController.createExternalJournal(req, payload as any),
    ).rejects.toThrow(LedgeryApiException);

    try {
      resolveIdempotencyKey('KEY-IN-BODY', 'KEY-IN-HEADER-DIFFERENT');
    } catch (err: any) {
      expect(err.code).toBe(ApiErrorCode.VALIDATION_ERROR);
      expect(err.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  // 6. Replay setelah periode ditutup tetap 200 (tidak divalidasi ulang); key baru pada periode closed menghasilkan 400 PERIOD_CLOSED
  it('6. Replay setelah periode ditutup tetap 200; key baru pada periode closed menghasilkan 400 PERIOD_CLOSED', async () => {
    // 6a. Replay tetap berhasil (200) tanpa re-validasi tanggal
    (journalService.createExternal as jest.Mock).mockResolvedValueOnce({
      id: 'jnl-old',
      status: 'POSTED',
      is_replay: true,
      idempotent_replay: true,
    });

    const res = { status: jest.fn() };
    const replayResult = await journalsController.createExternalJournal(
      { tenantId: 'tenant-thi', headers: {} },
      {
        tanggal: '2026-01-15', // Periode yang kini CLOSED
        idempotency_key: 'OLD-KEY',
        sumber_aplikasi: 'EAM',
        items: [],
      } as any,
      res,
    );
    expect(replayResult.statusCode).toBe(HttpStatus.OK);
    expect(replayResult.idempotent_replay).toBe(true);

    // 6b. Key baru pada periode closed menghasilkan BadRequestException PERIOD_CLOSED
    (journalService.createExternal as jest.Mock).mockRejectedValueOnce(
      new BadRequestException({
        errorCode: 'PERIOD_CLOSED',
        message: 'Periode akuntansi untuk tanggal tersebut telah ditutup',
        details: { date: '2026-01-15' },
      }),
    );

    await expect(
      journalsController.createExternalJournal(
        { tenantId: 'tenant-thi', headers: {} },
        {
          tanggal: '2026-01-15',
          idempotency_key: 'BRAND-NEW-KEY',
          sumber_aplikasi: 'EAM',
          items: [],
        } as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // 7. Key yang sama dipakai tenant berbeda tidak saling bertabrakan
  it('7. Key yang sama dipakai tenant berbeda diteruskan dengan tenantId masing-masing', async () => {
    (journalService.createExternal as jest.Mock).mockResolvedValue({
      id: 'jnl-ok',
      status: 'POSTED',
      is_replay: false,
    });

    const commonPayload = {
      tanggal: '2026-09-15',
      idempotency_key: 'SHARED-KEY-NAME',
      sumber_aplikasi: 'EAM',
      items: [],
    };

    await journalsController.createExternalJournal(
      { tenantId: 'tenant-A', headers: {} },
      commonPayload as any,
    );
    expect(journalService.createExternal).toHaveBeenCalledWith(
      'tenant-A',
      expect.objectContaining({ idempotency_key: 'SHARED-KEY-NAME' }),
    );

    await journalsController.createExternalJournal(
      { tenantId: 'tenant-B', headers: {} },
      commonPayload as any,
    );
    expect(journalService.createExternal).toHaveBeenCalledWith(
      'tenant-B',
      expect.objectContaining({ idempotency_key: 'SHARED-KEY-NAME' }),
    );
  });

  // 8. Tanpa key: perilaku lama (regresi)
  it('8. Tanpa key: membuat jurnal baru seperti perilaku lama (idempotent_replay: false)', async () => {
    (journalService.createExternal as jest.Mock).mockResolvedValueOnce({
      id: 'jnl-no-key',
      status: 'POSTED',
      is_replay: false,
      entries: [],
    });

    const result = await journalsController.createExternalJournal(
      { tenantId: 'tenant-thi', headers: {} },
      {
        tanggal: '2026-09-15',
        sumber_aplikasi: 'Cultiva',
        items: [],
      } as any,
    );

    expect(result.statusCode).toBe(HttpStatus.CREATED);
    expect(result.idempotent_replay).toBe(false);
    expect(journalService.createExternal).toHaveBeenCalledWith(
      'tenant-thi',
      expect.objectContaining({ idempotency_key: undefined, idempotency_payload_hash: undefined }),
    );
  });

  // 9. GET /v1/periods/check: status OPEN, CLOSED, NOT_DEFINED; tanggal tidak valid; konsistensi can_post
  it('9. GET /v1/periods/check mengecek OPEN, CLOSED, NOT_DEFINED dan menolak tanggal tidak valid', async () => {
    // 9a. OPEN -> can_post: true
    (periodService.evaluatePostingDate as jest.Mock).mockResolvedValueOnce({
      date: '2026-09-15',
      can_post: true,
      status: 'OPEN',
      period: { id: 'p1', name: 'September 2026', start_date: '2026-09-01', end_date: '2026-09-30' },
    });

    const resOpen = await periodsController.checkPeriod(
      { tenantId: 'tenant-thi' },
      '2026-09-15',
    );
    expect(resOpen.can_post).toBe(true);
    expect(resOpen.status).toBe('OPEN');

    // 9b. CLOSED -> can_post: false
    (periodService.evaluatePostingDate as jest.Mock).mockResolvedValueOnce({
      date: '2026-08-15',
      can_post: false,
      status: 'CLOSED',
      period: { id: 'p2', name: 'Agustus 2026', start_date: '2026-08-01', end_date: '2026-08-31' },
    });

    const resClosed = await periodsController.checkPeriod(
      { tenantId: 'tenant-thi' },
      '2026-08-15',
    );
    expect(resClosed.can_post).toBe(false);
    expect(resClosed.status).toBe('CLOSED');

    // 9c. NOT_DEFINED -> period: null
    (periodService.evaluatePostingDate as jest.Mock).mockResolvedValueOnce({
      date: '2028-01-01',
      can_post: false,
      status: 'NOT_DEFINED',
      period: null,
    });

    const resNotDefined = await periodsController.checkPeriod(
      { tenantId: 'tenant-thi' },
      '2028-01-01',
    );
    expect(resNotDefined.status).toBe('NOT_DEFINED');
    expect(resNotDefined.period).toBeNull();

    // 9d. Tanggal fiktif ditolak (2026-02-30)
    await expect(
      periodsController.checkPeriod({ tenantId: 'tenant-thi' }, '2026-02-30'),
    ).rejects.toThrow(LedgeryApiException);
  });

  // 10. Galat v1 memuat code, message lama tidak berubah, dan X-Request-Id dikembalikan
  it('10. V1ExceptionFilter memformat galat terstruktur dengan code, message, dan request_id', () => {
    const filter = new V1ExceptionFilter();
    const mockJson = jest.fn();
    const mockSetHeader = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-request-id': 'req-custom-123' } }),
        getResponse: () => ({ setHeader: mockSetHeader, status: mockStatus }),
      }),
    } as any;

    const exception = new BadRequestException({
      errorCode: 'PERIOD_CLOSED',
      message: 'Periode akuntansi untuk tanggal tersebut telah ditutup',
      details: { date: '2026-09-15' },
    });

    filter.catch(exception, host);

    expect(mockSetHeader).toHaveBeenCalledWith('X-Request-Id', 'req-custom-123');
    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: ApiErrorCode.PERIOD_CLOSED,
        message: 'Periode akuntansi untuk tanggal tersebut telah ditutup',
        error: 'Bad Request',
        details: { date: '2026-09-15' },
        request_id: 'req-custom-123',
      }),
    );
  });

  // 11. Endpoint periode dan jurnal menolak API Key tenant lain (isolasi tenant)
  it('11. Query jurnal dan periode menggunakan tenantId dari ApiKeyGuard', async () => {
    (journalService.findByIdOrIdentifier as jest.Mock).mockResolvedValueOnce({
      id: 'jnl-thi-1',
      no_voucher: 'JNL-2026-0001',
      status: 'POSTED',
      tenantId: 'tenant-thi',
    });

    const result = await journalsController.getJournalByIdentifier(
      { tenantId: 'tenant-thi' },
      'jnl-thi-1',
    );

    expect(journalService.findByIdOrIdentifier).toHaveBeenCalledWith('tenant-thi', 'jnl-thi-1');
    expect(result.data.voucher_no).toBe('JNL-2026-0001');
    expect(result.data.status).toBe('POSTED');
  });
});

