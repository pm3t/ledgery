import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateJournalDto, CreateManualJournalDto } from './dto/create-journal.dto';
import { JournalStatus, PostingPolicyMode, EntryType } from '@prisma/client';

import { AccountingPeriodService } from '../accounting-period/accounting-period.service';

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly accountingPeriodService: AccountingPeriodService,
  ) {}

  // Generate Nomor Voucher Otomatis (Contoh: JNL-2026-0001)
  private async generateVoucherNumber(tenantId: string, tanggal: string): Promise<string> {
    const year = new Date(tanggal).getFullYear();
    
    // Cari jurnal terakhir di tahun tersebut untuk tenant ini
    const lastJournal = await this.prisma.journal.findFirst({
      where: {
        tenantId,
        no_voucher: {
          startsWith: `JNL-${year}-`,
        },
      },
      orderBy: {
        no_voucher: 'desc',
      },
    });

    let nextNumber = 1;
    if (lastJournal && lastJournal.no_voucher) {
      const parts = lastJournal.no_voucher.split('-');
      if (parts.length === 3) {
        nextNumber = parseInt(parts[2], 10) + 1;
      }
    }

    const paddedNumber = nextNumber.toString().padStart(4, '0');
    return `JNL-${year}-${paddedNumber}`;
  }

  // Validasi Balance (Total Debit == Total Kredit)
  private validateBalance(entries: { tipe: string; jumlah: number }[]): void {
    let totalDebit = 0;
    let totalKredit = 0;

    for (const entry of entries) {
      if (entry.tipe === 'DEBIT') {
        totalDebit += Number(entry.jumlah);
      } else if (entry.tipe === 'KREDIT') {
        totalKredit += Number(entry.jumlah);
      }
    }

    // Menggunakan epsilon kecil untuk mengatasi isu floating point precision bawaan JS
    if (Math.abs(totalDebit - totalKredit) > 0.001) {
      throw new BadRequestException({
        errorCode: 'UNBALANCED_JOURNAL',
        message: `Jurnal tidak balance! Total Debit: ${totalDebit}, Total Kredit: ${totalKredit}`,
        details: { totalDebit, totalKredit, difference: Math.abs(totalDebit - totalKredit) },
      });
    }
  }

  // Validasi Dimensi
  private async getValidDimensionMap(tx: any, tenantId: string, entries: any[]): Promise<Map<string, { dimensionId: string, dimensionValueId: string }>> {
    const requestedDims = [];
    for (const entry of entries) {
      if (entry.dimensions && entry.dimensions.length > 0) {
        for (const dim of entry.dimensions) {
          requestedDims.push({ nama_dimension: dim.nama_dimension, kode_value: dim.kode_value });
        }
      }
    }
    
    const dimMap = new Map<string, { dimensionId: string, dimensionValueId: string }>();
    if (requestedDims.length === 0) return dimMap;

    // Ambil semua dimensi tenant
    const dimensions = await tx.dimension.findMany({
      where: { tenantId, isActive: true },
      include: { values: { where: { isActive: true } } },
    });

    // Validasi satu per satu
    for (const req of requestedDims) {
      const key = `${req.nama_dimension}|${req.kode_value}`;
      if (dimMap.has(key)) continue;

      const dim = dimensions.find((d: any) => d.nama_dimension === req.nama_dimension);
      if (!dim) {
        throw new BadRequestException({
          errorCode: 'DIMENSION_NOT_FOUND',
          message: `Dimensi '${req.nama_dimension}' tidak ditemukan atau tidak aktif di tenant ini.`,
          details: { nama_dimension: req.nama_dimension },
        });
      }
      const val = dim.values.find((v: any) => v.kode === req.kode_value);
      if (!val) {
        throw new BadRequestException({
          errorCode: 'DIMENSION_VALUE_NOT_FOUND',
          message: `Nilai dimensi '${req.kode_value}' untuk dimensi '${req.nama_dimension}' tidak ditemukan.`,
          details: { nama_dimension: req.nama_dimension, kode_value: req.kode_value },
        });
      }
      dimMap.set(key, { dimensionId: dim.id, dimensionValueId: val.id });
    }

    return dimMap;
  }

  // Membuat Jurnal Baru via API Eksternal
  async createExternal(tenantId: string, createDto: CreateJournalDto) {
    // 1. Cek Idempotency Key TERLEBIH DAHULU (sebelum validasi periode / akun)
    if (createDto.idempotency_key) {
      const existing = await this.prisma.journal.findUnique({
        where: {
          tenantId_idempotency_key: {
            tenantId,
            idempotency_key: createDto.idempotency_key,
          },
        },
        include: {
          entries: {
            include: {
              chartOfAccount: {
                select: { kode_akun: true, nama_akun: true },
              },
            },
          },
        },
      });

      if (existing) {
        // Cek kecocokan payload
        if (existing.idempotency_payload_hash && createDto.idempotency_payload_hash) {
          if (existing.idempotency_payload_hash !== createDto.idempotency_payload_hash) {
            throw new ConflictException({
              errorCode: 'IDEMPOTENCY_CONFLICT',
              message: `Idempotency key '${createDto.idempotency_key}' sudah pernah digunakan untuk transaksi dengan rincian yang berbeda.`,
              details: {
                journal_id: existing.id,
                voucher_no: existing.no_voucher,
                idempotency_key: createDto.idempotency_key,
              },
            });
          }
        } else if (existing.idempotency_payload_hash && !createDto.idempotency_payload_hash) {
          // Fallback legacy compare
          const isSameDate =
            new Date(existing.tanggal).toISOString().slice(0, 10) ===
            new Date(createDto.tanggal).toISOString().slice(0, 10);
          const existingCurrency = existing.mata_uang || 'IDR';
          const requestCurrency = createDto.mata_uang || 'IDR';
          const isSameCurrency = existingCurrency === requestCurrency;
          let isSameEntries = existing.entries.length === createDto.entries.length;
          if (isSameEntries) {
            for (const entry of createDto.entries) {
              const match = existing.entries.find(
                (e) =>
                  e.chartOfAccount.kode_akun === entry.kode_akun &&
                  e.tipe === entry.tipe &&
                  Math.abs(Number(e.jumlah_asli || e.jumlah) - Number(entry.jumlah)) < 0.001,
              );
              if (!match) {
                isSameEntries = false;
                break;
              }
            }
          }
          if (!isSameDate || !isSameCurrency || !isSameEntries) {
            throw new ConflictException({
              errorCode: 'IDEMPOTENCY_CONFLICT',
              message: `Idempotency key '${createDto.idempotency_key}' sudah pernah digunakan untuk transaksi dengan rincian yang berbeda.`,
              details: {
                journal_id: existing.id,
                voucher_no: existing.no_voucher,
                idempotency_key: createDto.idempotency_key,
              },
            });
          }
        }
        // Jurnal lama dengan hash null ATAU hash cocok -> kembalikan replay tanpa validasi ulang!
        return {
          ...existing,
          is_replay: true,
          idempotent_replay: true,
        };
      }
    }

    // 2. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(tenantId, new Date(createDto.tanggal));

    // 3. Validasi Balance Debit & Kredit
    this.validateBalance(createDto.entries);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Double check idempotency inside transaction
        if (createDto.idempotency_key) {
          const existingTx = await tx.journal.findUnique({
            where: {
              tenantId_idempotency_key: {
                tenantId,
                idempotency_key: createDto.idempotency_key,
              },
            },
            include: {
              entries: {
                include: {
                  chartOfAccount: {
                    select: { kode_akun: true, nama_akun: true },
                  },
                },
              },
            },
          });

          if (existingTx) {
            if (
              existingTx.idempotency_payload_hash &&
              createDto.idempotency_payload_hash &&
              existingTx.idempotency_payload_hash !== createDto.idempotency_payload_hash
            ) {
              throw new ConflictException({
                errorCode: 'IDEMPOTENCY_CONFLICT',
                message: `Idempotency key '${createDto.idempotency_key}' sudah pernah digunakan untuk transaksi dengan rincian yang berbeda.`,
                details: {
                  journal_id: existingTx.id,
                  voucher_no: existingTx.no_voucher,
                  idempotency_key: createDto.idempotency_key,
                },
              });
            }
            return {
              ...existingTx,
              is_replay: true,
              idempotent_replay: true,
            };
          }
        }

        // Validasi Keberadaan Kode Akun per Tenant & Status Aktif
        const kodeAkuns = createDto.entries.map((e) => e.kode_akun);
        const validAccounts = await tx.chartOfAccount.findMany({
          where: {
            tenantId,
            kode_akun: { in: kodeAkuns },
          },
        });

        const validAccountMap = new Map(validAccounts.map((acc) => [acc.kode_akun, acc]));
        
        for (const entry of createDto.entries) {
          const acc = validAccountMap.get(entry.kode_akun) as any;
          if (!acc) {
            throw new BadRequestException({
              errorCode: 'ACCOUNT_NOT_FOUND',
              message: `Kode akun '${entry.kode_akun}' tidak ditemukan di tenant ini.`,
              details: { kode_akun: entry.kode_akun },
            });
          }
          if (!acc.isActive) {
            throw new BadRequestException({
              errorCode: 'ACCOUNT_INACTIVE',
              message: `Akun '${acc.kode_akun} - ${acc.nama_akun}' sedang tidak aktif.`,
              details: { kode_akun: acc.kode_akun, isActive: acc.isActive },
            });
          }
          if (acc.isControlAccount || (acc.controlType && acc.controlType !== 'NONE')) {
            const tipe = acc.controlType && acc.controlType !== 'NONE' ? acc.controlType : 'Subledger';
            throw new BadRequestException({
              errorCode: 'CONTROL_ACCOUNT_MANUAL_POSTING_BLOCKED',
              message: `Akun ${acc.kode_akun} adalah akun kontrol ${tipe}; posting hanya melalui dokumen sub ledger`,
              details: { kode_akun: acc.kode_akun, nama_akun: acc.nama_akun, controlType: acc.controlType, isControlAccount: acc.isControlAccount },
            });
          }
        }

        const dimMap = await this.getValidDimensionMap(tx, tenantId, createDto.entries);
        
        // Validasi Multicurrency
        const tenantData = await tx.tenant.findUnique({ where: { id: tenantId } });
        const baseCurrency = tenantData?.mata_uang || 'IDR';
        const docCurrency = createDto.mata_uang || baseCurrency;
        let exchangeRate = 1;

        if (docCurrency !== baseCurrency) {
          const rate = await tx.exchangeRate.findFirst({
            where: {
              tenantId,
              currency: { kode_iso: docCurrency },
              tanggal: new Date(createDto.tanggal),
            },
            orderBy: { createdAt: 'desc' },
          });

          if (!rate) {
            throw new BadRequestException({
              errorCode: 'EXCHANGE_RATE_NOT_FOUND',
              message: `Kurs ${docCurrency} ke ${baseCurrency} untuk tanggal ${createDto.tanggal} belum diisi di Setting`,
              details: { currency: docCurrency, baseCurrency, date: createDto.tanggal },
            });
          }
          exchangeRate = rate.kurs;
        }
        
        const entryData = [];
        for (const entry of createDto.entries) {
          const acc = validAccountMap.get(entry.kode_akun)! as any;
          const accountId = acc.id;

          const entryDimensions = [];
          if (entry.dimensions) {
            for (const d of entry.dimensions) {
              const dimIds = dimMap.get(`${d.nama_dimension}|${d.kode_value}`);
              if (dimIds) {
                entryDimensions.push({ dimensionId: dimIds.dimensionId, dimensionValueId: dimIds.dimensionValueId });
              }
            }
          }

          const jumlahAsli = entry.jumlah;
          const jumlahKonversi = jumlahAsli * exchangeRate;

          entryData.push({
            chartOfAccountId: accountId,
            tipe: entry.tipe,
            jumlah: jumlahKonversi,
            jumlah_asli: docCurrency !== baseCurrency ? jumlahAsli : null,
            jumlah_konversi: jumlahKonversi,
            dimensions: entryDimensions.length > 0 ? { create: entryDimensions } : undefined,
          });
        }

        // Generate No Voucher
        const no_voucher = await this.generateVoucherNumber(tenantId, createDto.tanggal);

        // Cek Posting Policy Setting
        let statusToSave: JournalStatus = JournalStatus.POSTED;
        const policy = await tx.postingPolicySetting.findUnique({
          where: { tenantId },
        });

        if (policy && policy.mode === PostingPolicyMode.APPROVAL_MANUAL) {
          statusToSave = JournalStatus.PENDING;
        }

        // Simpan Jurnal & Entri
        const newJournal = await tx.journal.create({
          data: {
            tenantId,
            no_voucher,
            tanggal: new Date(createDto.tanggal),
            deskripsi: createDto.deskripsi,
            sumber_aplikasi: createDto.sumber_aplikasi,
            status: statusToSave,
            idempotency_key: createDto.idempotency_key || null,
            idempotency_payload_hash: createDto.idempotency_payload_hash || null,
            mata_uang: docCurrency,
            entries: {
              create: entryData,
            },
          },
          include: {
            entries: {
              include: {
                chartOfAccount: {
                  select: { kode_akun: true, nama_akun: true },
                },
              },
            },
          },
        });

        // Panggil event jika status PENDING
        if (statusToSave === JournalStatus.PENDING) {
          this.eventEmitter.emit('journal.pending', {
            tenantId,
            journalId: newJournal.id,
            no_voucher: newJournal.no_voucher,
          });
        }

        return newJournal;
      });
    } catch (err: any) {
      // Tangani race condition Prisma P2002 (Unique constraint violation)
      if (
        err.code === 'P2002' &&
        createDto.idempotency_key &&
        (err.meta?.target?.includes('idempotency_key') || String(err.message).includes('idempotency_key'))
      ) {
        const winner = await this.prisma.journal.findUnique({
          where: {
            tenantId_idempotency_key: {
              tenantId,
              idempotency_key: createDto.idempotency_key,
            },
          },
          include: {
            entries: {
              include: {
                chartOfAccount: {
                  select: { kode_akun: true, nama_akun: true },
                },
              },
            },
          },
        });
        if (winner) {
          if (
            !winner.idempotency_payload_hash ||
            !createDto.idempotency_payload_hash ||
            winner.idempotency_payload_hash === createDto.idempotency_payload_hash
          ) {
            return {
              ...winner,
              is_replay: true,
              idempotent_replay: true,
            };
          }
          throw new ConflictException({
            errorCode: 'IDEMPOTENCY_CONFLICT',
            message: `Idempotency key '${createDto.idempotency_key}' sudah pernah digunakan untuk transaksi dengan rincian yang berbeda.`,
            details: {
              journal_id: winner.id,
              voucher_no: winner.no_voucher,
              idempotency_key: createDto.idempotency_key,
            },
          });
        }
      }
      throw err;
    }
  }

  // Membuat Jurnal Manual (Dashboard Internal Staf)
  async createManual(createDto: CreateManualJournalDto) {
    const { tenantId, ...journalDto } = createDto;
    
    // Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(tenantId, new Date(createDto.tanggal));

    // Untuk jurnal manual yang dibuat oleh staf, status langsung POSTED
    // dan sumber aplikasi di-set manual atau dari DTO
    
    return this.prisma.$transaction(async (tx) => {
      this.validateBalance(createDto.entries);

      const kodeAkuns = createDto.entries.map((e) => e.kode_akun);
      const validAccounts = await tx.chartOfAccount.findMany({
        where: {
          tenantId,
          kode_akun: { in: kodeAkuns },
          isActive: true,
        },
      });

      const validAccountMap = new Map(validAccounts.map((acc) => [acc.kode_akun, acc.id]));
      
      // Proteksi Akun Kontrol: Blokir jurnal manual langsung pada akun kontrol subledger
      for (const acc of validAccounts) {
        if (acc.isControlAccount || (acc.controlType && acc.controlType !== 'NONE')) {
          const tipe = acc.controlType && acc.controlType !== 'NONE' ? acc.controlType : 'Subledger';
          throw new BadRequestException({
            errorCode: 'CONTROL_ACCOUNT_MANUAL_POSTING_BLOCKED',
            message: `Akun ${acc.kode_akun} adalah akun kontrol ${tipe}; posting hanya melalui dokumen sub ledger`,
            details: {
              kode_akun: acc.kode_akun,
              nama_akun: acc.nama_akun,
              controlType: acc.controlType,
              isControlAccount: acc.isControlAccount,
            },
          });
        }
      }
      
      // Validasi Dimensi
      const dimMap = await this.getValidDimensionMap(tx, tenantId, createDto.entries);
      
      // Validasi Multicurrency
      const tenantData = await tx.tenant.findUnique({ where: { id: tenantId } });
      const baseCurrency = tenantData?.mata_uang || 'IDR';
      const docCurrency = createDto.mata_uang || baseCurrency;
      let exchangeRate = 1;

      if (docCurrency !== baseCurrency) {
        const rate = await tx.exchangeRate.findFirst({
          where: {
            tenantId,
            currency: { kode_iso: docCurrency },
            tanggal: new Date(createDto.tanggal),
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!rate) {
          throw new BadRequestException(`Kurs ${docCurrency} ke ${baseCurrency} untuk tanggal ${createDto.tanggal} belum diisi di Setting`);
        }
        exchangeRate = rate.kurs;
      }
      
      const entryData = [];
      for (const entry of createDto.entries) {
        const accountId = validAccountMap.get(entry.kode_akun);
        if (!accountId) {
          throw new BadRequestException(
            `Kode akun '${entry.kode_akun}' tidak ditemukan.`,
          );
        }

        const entryDimensions = [];
        if (entry.dimensions) {
          for (const d of entry.dimensions) {
            const dimIds = dimMap.get(`${d.nama_dimension}|${d.kode_value}`);
            if (dimIds) {
              entryDimensions.push({ dimensionId: dimIds.dimensionId, dimensionValueId: dimIds.dimensionValueId });
            }
          }
        }

        const jumlahAsli = entry.jumlah;
        const jumlahKonversi = jumlahAsli * exchangeRate;

        entryData.push({
          chartOfAccountId: accountId,
          tipe: entry.tipe,
          jumlah: jumlahKonversi,
          jumlah_asli: docCurrency !== baseCurrency ? jumlahAsli : null,
          jumlah_konversi: jumlahKonversi,
          dimensions: entryDimensions.length > 0 ? { create: entryDimensions } : undefined,
        });
      }

      const no_voucher = await this.generateVoucherNumber(tenantId, createDto.tanggal);

      const newJournal = await tx.journal.create({
        data: {
          tenantId,
          no_voucher,
          tanggal: new Date(createDto.tanggal),
          deskripsi: createDto.deskripsi,
          sumber_aplikasi: createDto.sumber_aplikasi || 'Dashboard Manual',
          status: JournalStatus.POSTED, // Manual selalu POSTED (bisa ditambahkan alur approval berjenjang di V2)
          mata_uang: docCurrency,
          entries: {
            create: entryData,
          },
        },
        include: {
          entries: {
            include: {
              chartOfAccount: {
                select: { kode_akun: true, nama_akun: true },
              },
            },
          },
        },
      });

      return newJournal;
    });
  }

  // Mengambil Daftar Jurnal per Tenant dengan Filter
  async findByTenant(tenantId: string, filter?: { status?: JournalStatus; startDate?: string; endDate?: string; sumber?: string }) {
    const whereClause: any = { tenantId };

    if (filter?.status) {
      whereClause.status = filter.status;
    }
    
    if (filter?.sumber) {
      whereClause.sumber_aplikasi = { contains: filter.sumber, mode: 'insensitive' };
    }

    if (filter?.startDate || filter?.endDate) {
      whereClause.tanggal = {};
      if (filter.startDate) whereClause.tanggal.gte = new Date(filter.startDate);
      if (filter.endDate) whereClause.tanggal.lte = new Date(filter.endDate);
    }

    return this.prisma.journal.findMany({
      where: whereClause,
      include: {
        entries: {
          include: {
            chartOfAccount: {
              select: { kode_akun: true, nama_akun: true, kategori: true },
            },
            dimensions: {
              include: {
                dimensionValue: {
                  include: {
                    dimension: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { tanggal: 'desc' },
    });
  }

  // Mengambil 1 Jurnal berdasarkan ID, No Voucher, atau Idempotency Key (untuk Polling EAM)
  async findByIdOrIdentifier(tenantId: string, identifier: string) {
    const journal = await this.prisma.journal.findFirst({
      where: {
        tenantId,
        OR: [
          { id: identifier },
          { no_voucher: identifier },
          { idempotency_key: identifier },
        ],
      },
      include: {
        entries: {
          include: {
            chartOfAccount: {
              select: { kode_akun: true, nama_akun: true },
            },
            dimensions: {
              include: {
                dimensionValue: {
                  include: {
                    dimension: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!journal) {
      throw new NotFoundException({
        errorCode: 'JOURNAL_NOT_FOUND',
        message: `Jurnal dengan identifier '${identifier}' tidak ditemukan`,
      });
    }

    return journal;
  }

  // Membuat Jurnal Reversal (Pembalik) dengan status PENDING untuk diposting manual setelahnya
  async reverseJournal(
    tenantId: string,
    journalIdOrIdentifier: string,
    dto: { tanggal?: string; alasan?: string },
  ) {
    // 1. Ambil jurnal asli
    const original = await this.prisma.journal.findFirst({
      where: {
        tenantId,
        OR: [
          { id: journalIdOrIdentifier },
          { no_voucher: journalIdOrIdentifier },
          { idempotency_key: journalIdOrIdentifier },
        ],
      },
      include: {
        entries: {
          include: {
            dimensions: true,
          },
        },
      },
    });

    if (!original) {
      throw new NotFoundException({
        errorCode: 'JOURNAL_NOT_FOUND',
        message: `Jurnal dengan ID/identifier '${journalIdOrIdentifier}' tidak ditemukan.`,
      });
    }

    if (original.status === JournalStatus.REJECTED) {
      throw new BadRequestException({
        errorCode: 'INVALID_JOURNAL_STATUS',
        message: 'Jurnal yang berstatus REJECTED tidak dapat dibalik.',
      });
    }

    // 2. Tentukan tanggal reversal (default hari ini jika tidak dispesifikasikan)
    const reversalDateStr = dto.tanggal || new Date().toISOString().slice(0, 10);
    const reversalDate = new Date(reversalDateStr);

    // 3. Validasi status periode akuntansi untuk tanggal reversal
    await this.accountingPeriodService.validateJournalDate(tenantId, reversalDate);

    return this.prisma.$transaction(async (tx) => {
      // 4. Generate no voucher baru
      const no_voucher = await this.generateVoucherNumber(tenantId, reversalDateStr);

      // 5. Susun rincian entri baru dengan membalik DEBIT <-> KREDIT
      const reversedEntries = original.entries.map((entry) => {
        const reversedType = entry.tipe === EntryType.DEBIT ? EntryType.KREDIT : EntryType.DEBIT;
        const dimensionCreates = entry.dimensions.map((d) => ({
          dimensionId: d.dimensionId,
          dimensionValueId: d.dimensionValueId,
        }));

        return {
          chartOfAccountId: entry.chartOfAccountId,
          tipe: reversedType,
          jumlah: entry.jumlah,
          jumlah_asli: entry.jumlah_asli,
          jumlah_konversi: entry.jumlah_konversi,
          dimensions: dimensionCreates.length > 0 ? { create: dimensionCreates } : undefined,
        };
      });

      const deskripsi = dto.alasan
        ? `[REVERSAL] Reversal ${original.no_voucher}: ${dto.alasan}`
        : `[REVERSAL] Reversal voucher ${original.no_voucher}: ${original.deskripsi}`;

      // 6. Buat jurnal pembalik dengan status PENDING (posting manual setelahnya)
      const reversalJournal = await tx.journal.create({
        data: {
          tenantId,
          no_voucher,
          tanggal: reversalDate,
          deskripsi,
          sumber_aplikasi: 'Reversal',
          status: JournalStatus.PENDING,
          mata_uang: original.mata_uang,
          entries: {
            create: reversedEntries,
          },
        },
        include: {
          entries: {
            include: {
              chartOfAccount: {
                select: { kode_akun: true, nama_akun: true },
              },
            },
          },
        },
      });

      // Panggil event agar muncul notifikasi approval di dashboard
      this.eventEmitter.emit('journal.pending', {
        tenantId,
        journalId: reversalJournal.id,
        no_voucher: reversalJournal.no_voucher,
      });

      return reversalJournal;
    });
  }

  // Membuat Jurnal Khusus dari Dokumen Subledger (AR, AP, Inventory)
  // Dikecualikan dari blokir akun kontrol dan langsung berstatus POSTED
  async createFromSubledger(tenantId: string, dto: {
    tanggal: string;
    deskripsi: string;
    sumber_aplikasi: string;
    sourceDocType?: string;
    sourceDocId?: string;
    no_voucher?: string;
    mata_uang?: string;
    idempotency_key?: string;
    entries: {
      kode_akun: string;
      tipe: EntryType;
      jumlah: number;
      dimensions?: { nama_dimension: string; kode_value: string }[];
    }[];
  }) {
    // 1. Validasi Periode Akuntansi
    await this.accountingPeriodService.validateJournalDate(tenantId, new Date(dto.tanggal));

    // 2. Validasi Balance Debit & Kredit
    this.validateBalance(dto.entries);

    return this.prisma.$transaction(async (tx) => {
      // 3. Validasi Akun (Aktif & Berada di Tenant yang Sama)
      const kodeAkuns = dto.entries.map((e) => e.kode_akun);
      const validAccounts = await tx.chartOfAccount.findMany({
        where: {
          tenantId,
          kode_akun: { in: kodeAkuns },
        },
      });

      const validAccountMap = new Map(validAccounts.map((acc) => [acc.kode_akun, acc]));

      for (const entry of dto.entries) {
        const acc = validAccountMap.get(entry.kode_akun);
        if (!acc) {
          throw new BadRequestException({
            errorCode: 'ACCOUNT_NOT_FOUND',
            message: `Kode akun '${entry.kode_akun}' tidak ditemukan di tenant ini.`,
            details: { kode_akun: entry.kode_akun },
          });
        }
        if (!acc.isActive) {
          throw new BadRequestException({
            errorCode: 'ACCOUNT_INACTIVE',
            message: `Akun '${acc.kode_akun} - ${acc.nama_akun}' sedang tidak aktif.`,
            details: { kode_akun: acc.kode_akun, isActive: acc.isActive },
          });
        }
        // Catatan: Akun kontrol sengaja DIIZINKAN di sini karena diposting melalui dokumen subledger yang sah!
      }

      // 4. Validasi Dimensi
      const dimMap = await this.getValidDimensionMap(tx, tenantId, dto.entries);

      // 5. Validasi Multicurrency
      const tenantData = await tx.tenant.findUnique({ where: { id: tenantId } });
      const baseCurrency = tenantData?.mata_uang || 'IDR';
      const docCurrency = dto.mata_uang || baseCurrency;
      let exchangeRate = 1;

      if (docCurrency !== baseCurrency) {
        const rate = await tx.exchangeRate.findFirst({
          where: {
            tenantId,
            currency: { kode_iso: docCurrency },
            tanggal: new Date(dto.tanggal),
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!rate) {
          throw new BadRequestException({
            errorCode: 'EXCHANGE_RATE_NOT_FOUND',
            message: `Kurs ${docCurrency} ke ${baseCurrency} untuk tanggal ${dto.tanggal} belum diisi di Setting`,
            details: { currency: docCurrency, baseCurrency, date: dto.tanggal },
          });
        }
        exchangeRate = rate.kurs;
      }

      const entryData = [];
      for (const entry of dto.entries) {
        const acc = validAccountMap.get(entry.kode_akun)!;
        const entryDimensions = [];
        if (entry.dimensions) {
          for (const d of entry.dimensions) {
            const dimIds = dimMap.get(`${d.nama_dimension}|${d.kode_value}`);
            if (dimIds) {
              entryDimensions.push({ dimensionId: dimIds.dimensionId, dimensionValueId: dimIds.dimensionValueId });
            }
          }
        }

        const jumlahAsli = entry.jumlah;
        const jumlahKonversi = jumlahAsli * exchangeRate;

        entryData.push({
          chartOfAccountId: acc.id,
          tipe: entry.tipe,
          jumlah: jumlahKonversi,
          jumlah_asli: docCurrency !== baseCurrency ? jumlahAsli : null,
          jumlah_konversi: jumlahKonversi,
          dimensions: entryDimensions.length > 0 ? { create: entryDimensions } : undefined,
        });
      }

      // 6. Generate No Voucher jika belum ada
      const no_voucher = dto.no_voucher || (await this.generateVoucherNumber(tenantId, dto.tanggal));

      // 7. Simpan Jurnal dengan status POSTED langsung
      return await tx.journal.create({
        data: {
          tenantId,
          no_voucher,
          tanggal: new Date(dto.tanggal),
          deskripsi: dto.deskripsi,
          sumber_aplikasi: dto.sumber_aplikasi,
          status: JournalStatus.POSTED,
          sourceDocType: dto.sourceDocType || null,
          sourceDocId: dto.sourceDocId || null,
          idempotency_key: dto.idempotency_key || null,
          mata_uang: docCurrency,
          entries: {
            create: entryData,
          },
        },
        include: {
          entries: {
            include: {
              chartOfAccount: {
                select: { kode_akun: true, nama_akun: true },
              },
            },
          },
        },
      });
    });
  }

  // Membuat Jurnal Reversal dari Subledger dengan status POSTED langsung
  async reverseFromSubledger(tenantId: string, journalIdOrIdentifier: string, tanggal?: string, alasan?: string) {
    const original = await this.prisma.journal.findFirst({
      where: {
        tenantId,
        OR: [
          { id: journalIdOrIdentifier },
          { no_voucher: journalIdOrIdentifier },
        ],
      },
      include: {
        entries: {
          include: {
            chartOfAccount: true,
            dimensions: true,
          },
        },
      },
    });

    if (!original) {
      throw new NotFoundException({
        errorCode: 'JOURNAL_NOT_FOUND',
        message: `Jurnal dengan ID '${journalIdOrIdentifier}' tidak ditemukan.`,
      });
    }

    const reversalDateStr = tanggal || new Date().toISOString().slice(0, 10);
    const reversalDate = new Date(reversalDateStr);

    // Validasi periode
    await this.accountingPeriodService.validateJournalDate(tenantId, reversalDate);

    return this.prisma.$transaction(async (tx) => {
      const no_voucher = await this.generateVoucherNumber(tenantId, reversalDateStr);

      const reversedEntries = original.entries.map((entry) => {
        const reversedType = entry.tipe === EntryType.DEBIT ? EntryType.KREDIT : EntryType.DEBIT;
        const dimensionCreates = entry.dimensions.map((d) => ({
          dimensionId: d.dimensionId,
          dimensionValueId: d.dimensionValueId,
        }));

        return {
          chartOfAccountId: entry.chartOfAccountId,
          tipe: reversedType,
          jumlah: entry.jumlah,
          jumlah_asli: entry.jumlah_asli,
          jumlah_konversi: entry.jumlah_konversi,
          dimensions: dimensionCreates.length > 0 ? { create: dimensionCreates } : undefined,
        };
      });

      const deskripsi = alasan
        ? `[REVERSAL] Reversal ${original.no_voucher}: ${alasan}`
        : `[REVERSAL] Reversal voucher ${original.no_voucher}: ${original.deskripsi}`;

      return await tx.journal.create({
        data: {
          tenantId,
          no_voucher,
          tanggal: reversalDate,
          deskripsi,
          sumber_aplikasi: 'SUBLEDGER-REVERSAL',
          status: JournalStatus.POSTED,
          sourceDocType: original.sourceDocType,
          sourceDocId: original.sourceDocId,
          mata_uang: original.mata_uang,
          entries: {
            create: reversedEntries,
          },
        },
        include: {
          entries: {
            include: {
              chartOfAccount: {
                select: { kode_akun: true, nama_akun: true },
              },
            },
          },
        },
      });
    });
  }
}
