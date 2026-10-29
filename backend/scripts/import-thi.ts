import { PrismaClient, KategoriAkun, PeriodStatus, EntryType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting import for tenant THI...');

  // 1. Locate Tenant THI
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { id: '362a3b92-5a0f-4665-9447-56196a175818' },
        { nama_perusahaan: 'THI' },
      ],
    },
  });

  if (!tenant) {
    throw new Error('Tenant THI not found in database!');
  }

  const tenantId = tenant.id;
  console.log(`✅ Found Tenant: ${tenant.nama_perusahaan} (${tenantId})`);

  // 2. Load seed data
  const dataPath = path.join(__dirname, 'thi_seed_data.json');
  const rawData = fs.readFileSync(dataPath, 'utf-8');
  const data = JSON.parse(rawData);

  // 3. Remove placeholder starter COAs if they have no entries
  const placeholderCodes = ['100000', '200000', '300000', '400000', '600000'];
  for (const code of placeholderCodes) {
    const existing = await prisma.chartOfAccount.findUnique({
      where: {
        tenantId_kode_akun: {
          tenantId,
          kode_akun: code,
        },
      },
      include: {
        _count: {
          select: { journalEntries: true, children: true },
        },
      },
    });

    if (existing && existing._count.journalEntries === 0 && existing._count.children === 0) {
      await prisma.chartOfAccount.delete({
        where: { id: existing.id },
      });
      console.log(`🗑️ Removed placeholder COA: ${code}`);
    }
  }

  // 4. Create Fiscal Year 2026 & Periods if not exists
  let fiscalYear = await prisma.fiscalYear.findFirst({
    where: {
      tenantId,
      nama_tahun_buku: 'Tahun Buku 2026',
    },
  });

  if (!fiscalYear) {
    fiscalYear = await prisma.fiscalYear.create({
      data: {
        tenantId,
        nama_tahun_buku: 'Tahun Buku 2026',
        tanggal_mulai: new Date('2026-01-01T00:00:00.000Z'),
        tanggal_selesai: new Date('2026-12-31T23:59:59.999Z'),
      },
    });
    console.log(`📅 Created Fiscal Year: ${fiscalYear.nama_tahun_buku}`);

    // Create 12 Periods
    const periodsData = [];
    for (let m = 1; m <= 12; m++) {
      const start = new Date(Date.UTC(2026, m - 1, 1, 0, 0, 0));
      const end = new Date(Date.UTC(2026, m, 0, 23, 59, 59, 999));
      periodsData.push({
        fiscalYearId: fiscalYear.id,
        nomor_periode: m,
        tanggal_mulai: start,
        tanggal_selesai: end,
        status: PeriodStatus.OPEN,
      });
    }

    await prisma.accountingPeriod.createMany({
      data: periodsData,
    });
    console.log('📅 Created 12 accounting periods for 2026 (all OPEN)');
  } else {
    console.log(`ℹ️ Fiscal Year already exists: ${fiscalYear.nama_tahun_buku}`);
  }

  // 5. Create Chart of Accounts
  console.log(`📦 Upserting ${data.coa_list.length} Chart of Accounts...`);
  const coaMap = new Map<string, string>(); // kode_akun -> id

  // Helper function to insert level by level
  let remaining = [...data.coa_list];
  let passes = 0;

  while (remaining.length > 0 && passes < 10) {
    passes++;
    const nextRemaining = [];

    for (const item of remaining) {
      // If item has a parent_kode, check if parent is already created
      let parentId: string | null = null;
      if (item.parent_kode) {
        if (!coaMap.has(item.parent_kode)) {
          // Parent not created yet in map, check DB or defer
          const dbParent = await prisma.chartOfAccount.findUnique({
            where: {
              tenantId_kode_akun: {
                tenantId,
                kode_akun: item.parent_kode,
              },
            },
          });

          if (dbParent) {
            coaMap.set(item.parent_kode, dbParent.id);
            parentId = dbParent.id;
          } else {
            nextRemaining.push(item);
            continue;
          }
        } else {
          parentId = coaMap.get(item.parent_kode)!;
        }
      }

      // Upsert COA
      const coaRecord = await prisma.chartOfAccount.upsert({
        where: {
          tenantId_kode_akun: {
            tenantId,
            kode_akun: item.kode,
          },
        },
        update: {
          nama_akun: item.nama,
          kategori: item.kategori as KategoriAkun,
          isControlAccount: item.is_control,
          parentId: parentId,
          isActive: true,
        },
        create: {
          tenantId,
          kode_akun: item.kode,
          nama_akun: item.nama,
          kategori: item.kategori as KategoriAkun,
          isControlAccount: item.is_control,
          parentId: parentId,
          isActive: true,
        },
      });

      coaMap.set(item.kode, coaRecord.id);
    }

    remaining = nextRemaining;
  }

  if (remaining.length > 0) {
    throw new Error(`Failed to resolve parents for COAs: ${remaining.map(r => r.kode).join(', ')}`);
  }
  console.log(`✅ All ${coaMap.size} Chart of Accounts upserted successfully.`);

  // 6. Create Opening Balance Journal
  console.log('📝 Creating Opening Balance Journal...');
  const obVoucherNo = 'OB/2026/01/01';
  const existingOb = await prisma.journal.findUnique({
    where: {
      tenantId_no_voucher: {
        tenantId,
        no_voucher: obVoucherNo,
      },
    },
  });

  if (!existingOb) {
    await prisma.journal.create({
      data: {
        tenantId,
        no_voucher: obVoucherNo,
        tanggal: new Date('2026-01-01T00:00:00.000Z'),
        deskripsi: 'Saldo Awal Pembukuan per 01 Januari 2026',
        sumber_aplikasi: 'Opening Balance',
        status: 'POSTED',
        entries: {
          create: data.opening_balances.map((e: any) => ({
            chartOfAccountId: coaMap.get(e.account_no)!,
            tipe: e.type as EntryType,
            jumlah: e.amount,
          })),
        },
      },
    });
    console.log(`✅ Opening Balance Journal created: ${obVoucherNo}`);
  } else {
    console.log(`ℹ️ Opening Balance Journal already exists: ${obVoucherNo}`);
  }

  // 7. Create All General Ledger Transactions
  console.log(`📝 Importing ${data.vouchers.length} General Ledger Vouchers...`);
  let importedCount = 0;
  let skippedCount = 0;

  for (const v of data.vouchers) {
    const existing = await prisma.journal.findUnique({
      where: {
        tenantId_no_voucher: {
          tenantId,
          no_voucher: v.no_voucher,
        },
      },
    });

    if (existing) {
      skippedCount++;
      continue;
    }

    await prisma.journal.create({
      data: {
        tenantId,
        no_voucher: v.no_voucher,
        tanggal: new Date(v.tanggal),
        deskripsi: v.deskripsi || v.no_voucher,
        sumber_aplikasi: v.sumber_aplikasi || 'General Ledger',
        status: 'POSTED',
        entries: {
          create: v.entries.map((e: any) => ({
            chartOfAccountId: coaMap.get(e.account_no)!,
            tipe: e.tipe as EntryType,
            jumlah: e.jumlah,
          })),
        },
      },
    });

    importedCount++;
    if (importedCount % 50 === 0) {
      console.log(`  Progress: ${importedCount} / ${data.vouchers.length} vouchers created...`);
    }
  }

  console.log(`✅ Import finished! Created: ${importedCount}, Skipped: ${skippedCount}`);

  // 8. Verification: Check Trial Balance and Financial Summary
  console.log('🔍 Running verification report...');
  const entries = await prisma.journalEntry.findMany({
    where: {
      journal: {
        tenantId,
        status: 'POSTED',
      },
    },
    include: {
      chartOfAccount: true,
      journal: true,
    },
  });

  let totalDebit = 0;
  let totalKredit = 0;
  const balanceMap = new Map<string, { coa: any; debit: number; kredit: number; saldo: number }>();

  for (const entry of entries) {
    const amount = Number(entry.jumlah);
    if (entry.tipe === 'DEBIT') totalDebit += amount;
    if (entry.tipe === 'KREDIT') totalKredit += amount;

    if (!balanceMap.has(entry.chartOfAccountId)) {
      balanceMap.set(entry.chartOfAccountId, {
        coa: entry.chartOfAccount,
        debit: 0,
        kredit: 0,
        saldo: 0,
      });
    }

    const rec = balanceMap.get(entry.chartOfAccountId)!;
    if (entry.tipe === 'DEBIT') rec.debit += amount;
    if (entry.tipe === 'KREDIT') rec.kredit += amount;
  }

  let totalAset = 0;
  let totalLiabilitas = 0;
  let totalEkuitas = 0;
  let totalPendapatan = 0;
  let totalBeban = 0;

  for (const rec of balanceMap.values()) {
    if (rec.coa.kategori === 'ASET') {
      rec.saldo = rec.debit - rec.kredit;
      totalAset += rec.saldo;
    } else if (rec.coa.kategori === 'BEBAN') {
      rec.saldo = rec.debit - rec.kredit;
      totalBeban += rec.saldo;
    } else if (rec.coa.kategori === 'LIABILITAS') {
      rec.saldo = rec.kredit - rec.debit;
      totalLiabilitas += rec.saldo;
    } else if (rec.coa.kategori === 'EKUITAS') {
      rec.saldo = rec.kredit - rec.debit;
      totalEkuitas += rec.saldo;
    } else if (rec.coa.kategori === 'PENDAPATAN') {
      rec.saldo = rec.kredit - rec.debit;
      totalPendapatan += rec.saldo;
    }
  }

  const labaBersih = totalPendapatan - totalBeban;
  const totalPasiva = totalLiabilitas + totalEkuitas + labaBersih;

  console.log('\n=============================================');
  console.log('       FINANCIAL REPORT VERIFICATION         ');
  console.log('=============================================');
  console.log(`Total Journals      : ${await prisma.journal.count({ where: { tenantId } })}`);
  console.log(`Total Journal Entries: ${entries.length}`);
  console.log(`Total Debit          : Rp ${totalDebit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Credit         : Rp ${totalKredit.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Debit == Credit      : ${Math.abs(totalDebit - totalKredit) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log('---------------------------------------------');
  console.log(`Total Aset           : Rp ${totalAset.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Expected: Rp 1.973.621.237,07)`);
  console.log(`Total Liabilitas     : Rp ${totalLiabilitas.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Expected: Rp 121.159.217,00)`);
  console.log(`Total Ekuitas Awal   : Rp ${totalEkuitas.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Pendapatan           : Rp ${totalPendapatan.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Beban                : Rp ${totalBeban.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Laba Bersih Berjalan : Rp ${labaBersih.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Expected: Rp -684.754.687,59)`);
  console.log(`Total Ekuitas Akhir  : Rp ${(totalEkuitas + labaBersih).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Expected: Rp 1.852.462.020,07)`);
  console.log(`Total Pasiva         : Rp ${totalPasiva.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Neraca Seimbang?     : ${Math.abs(totalAset - totalPasiva) < 0.01 ? '✅ 100% BALANCED' : '❌ UNBALANCED'}`);
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during import:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

