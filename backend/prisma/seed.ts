import { PrismaClient, UserRole, KategoriAkun, EntryType, JournalStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Memulai proses seed database Ledgery (Neon schema=ledgery)...');

  // 1. Buat akun Super Admin ABP
  const adminPasswordHash = await bcrypt.hash('admin123', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@ledgery.id' },
    update: {},
    create: {
      nama: 'Administrator ABP',
      email: 'admin@ledgery.id',
      password_hash: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      tenantId: null,
      isActive: true,
    },
  });
  console.log('✅ Super Admin dibuat:', superAdmin.email);

  // 2. Buat atau ambil tenant demo
  const demoTenant = await prisma.tenant.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      nama_perusahaan: 'PT Demo Sejahtera',
      tahun_buku_mulai: 2026,
      mata_uang: 'IDR',
    },
  });
  console.log('✅ Tenant demo disiapkan:', demoTenant.nama_perusahaan);

  // Pastikan PostingPolicySetting tersedia untuk tenant demo
  await prisma.postingPolicySetting.upsert({
    where: { tenantId: demoTenant.id },
    update: {},
    create: {
      tenantId: demoTenant.id,
      mode: 'AUTO_POST',
      updatedBy: 'System Seed',
    },
  });

  // 3. Buat akun Admin Tenant (untuk demo & SSO lintas aplikasi ABP)
  const adminTenantPasswordHash = await bcrypt.hash('tenant123', 12);
  const adminTenant = await prisma.user.upsert({
    where: { email: 'admin@demo-tenant.id' },
    update: {},
    create: {
      nama: 'Admin PT Demo Sejahtera',
      email: 'admin@demo-tenant.id',
      password_hash: adminTenantPasswordHash,
      role: UserRole.ADMIN_TENANT,
      tenantId: demoTenant.id,
      isActive: true,
    },
  });
  console.log('✅ Admin Tenant dibuat:', adminTenant.email);

  const ssoPasswordHash = await bcrypt.hash('demo123', 12);
  await prisma.user.upsert({
    where: { email: 'demo@abpcloud.my.id' },
    update: {},
    create: {
      nama: 'Budi Santoso (ABP SSO Demo)',
      email: 'demo@abpcloud.my.id',
      password_hash: ssoPasswordHash,
      role: UserRole.ADMIN_TENANT,
      tenantId: demoTenant.id,
      isActive: true,
    },
  });

  // 4. Buat akun Staf Akuntansi (untuk demo)
  const stafPasswordHash = await bcrypt.hash('staf123', 12);
  const stafAkuntansi = await prisma.user.upsert({
    where: { email: 'staf@demo-tenant.id' },
    update: {},
    create: {
      nama: 'Staf Akuntansi Demo',
      email: 'staf@demo-tenant.id',
      password_hash: stafPasswordHash,
      role: UserRole.STAF_AKUNTANSI,
      tenantId: demoTenant.id,
      isActive: true,
    },
  });
  console.log('✅ Staf Akuntansi dibuat:', stafAkuntansi.email);

  // 5. Buat daftar mata uang global
  const currencies = [
    { kode_iso: 'IDR', nama: 'Indonesian Rupiah' },
    { kode_iso: 'USD', nama: 'US Dollar' },
    { kode_iso: 'EUR', nama: 'Euro' },
    { kode_iso: 'SGD', nama: 'Singapore Dollar' },
    { kode_iso: 'JPY', nama: 'Japanese Yen' }
  ];

  for (const c of currencies) {
    await prisma.currency.upsert({
      where: { kode_iso: c.kode_iso },
      update: {},
      create: c,
    });
  }

  // 6. Buat Chart of Accounts (COA) standar untuk PT Demo Sejahtera
  const coaList = [
    { kode_akun: '1-1001', nama_akun: 'Kas Operasional & Kas Kecil', kategori: KategoriAkun.ASET },
    { kode_akun: '1-1002', nama_akun: 'Bank BCA Giro Korporat', kategori: KategoriAkun.ASET },
    { kode_akun: '1-1201', nama_akun: 'Piutang Usaha Pelanggan', kategori: KategoriAkun.ASET },
    { kode_akun: '1-1301', nama_akun: 'Persediaan Barang Dagang', kategori: KategoriAkun.ASET },
    { kode_akun: '2-1001', nama_akun: 'Utang Usaha Supplier', kategori: KategoriAkun.LIABILITAS },
    { kode_akun: '2-1201', nama_akun: 'Utang Gaji & PPh 21 TER', kategori: KategoriAkun.LIABILITAS },
    { kode_akun: '3-1001', nama_akun: 'Modal Disetor Pemegang Saham', kategori: KategoriAkun.EKUITAS },
    { kode_akun: '4-1001', nama_akun: 'Pendapatan Penjualan Retail (DigiSale)', kategori: KategoriAkun.PENDAPATAN },
    { kode_akun: '4-1002', nama_akun: 'Pendapatan Kontrak Layanan (Servio)', kategori: KategoriAkun.PENDAPATAN },
    { kode_akun: '5-1001', nama_akun: 'Beban Pokok Penjualan (HPP)', kategori: KategoriAkun.BEBAN },
    { kode_akun: '5-2001', nama_akun: 'Beban Gaji, Tunjangan & BPJS (Rekan HRIS)', kategori: KategoriAkun.BEBAN },
    { kode_akun: '5-2002', nama_akun: 'Beban Operasional & Utilitas Kantor', kategori: KategoriAkun.BEBAN },
  ];

  const coaMap: Record<string, string> = {};
  for (const item of coaList) {
    const acc = await prisma.chartOfAccount.upsert({
      where: {
        tenantId_kode_akun: {
          tenantId: demoTenant.id,
          kode_akun: item.kode_akun,
        },
      },
      update: {},
      create: {
        tenantId: demoTenant.id,
        kode_akun: item.kode_akun,
        nama_akun: item.nama_akun,
        kategori: item.kategori,
        isActive: true,
      },
    });
    coaMap[item.kode_akun] = acc.id;
  }
  console.log('✅ Chart of Accounts (12 akun) disiapkan.');

  // 7. Buat contoh Jurnal Terintegrasi (jika belum ada)
  const existingJournals = await prisma.journal.count({ where: { tenantId: demoTenant.id } });
  if (existingJournals === 0) {
    const sampleJournals = [
      {
        no_voucher: 'JV-202610-0001',
        tanggal: new Date('2026-10-01T08:00:00Z'),
        deskripsi: 'Setoran Modal Awal Tahun Buku PT Demo Sejahtera',
        sumber_aplikasi: 'MANUAL_ENTRY',
        status: JournalStatus.POSTED,
        entries: [
          { kode: '1-1002', tipe: EntryType.DEBIT, jumlah: 500000000 },
          { kode: '3-1001', tipe: EntryType.KREDIT, jumlah: 500000000 },
        ],
      },
      {
        no_voucher: 'JV-202610-0002',
        tanggal: new Date('2026-10-15T17:30:00Z'),
        deskripsi: 'Auto-Sync Rekap Penjualan POS Cabang Utama (DigiSale)',
        sumber_aplikasi: 'DIGISALE_POS',
        status: JournalStatus.POSTED,
        entries: [
          { kode: '1-1002', tipe: EntryType.DEBIT, jumlah: 185400000 },
          { kode: '4-1001', tipe: EntryType.KREDIT, jumlah: 185400000 },
        ],
      },
      {
        no_voucher: 'JV-202610-0003',
        tanggal: new Date('2026-10-20T14:15:00Z'),
        deskripsi: 'Pelunasan Invoice Kontrak Pest Control Gedung Korporat (Servio)',
        sumber_aplikasi: 'SERVIO_BILLING',
        status: JournalStatus.POSTED,
        entries: [
          { kode: '1-1002', tipe: EntryType.DEBIT, jumlah: 64500000 },
          { kode: '4-1002', tipe: EntryType.KREDIT, jumlah: 64500000 },
        ],
      },
      {
        no_voucher: 'JV-202610-0004',
        tanggal: new Date('2026-10-25T10:00:00Z'),
        deskripsi: 'Jurnal Penggajian, BPJS & PPh 21 TER Oktober 2026 (Rekan HRIS)',
        sumber_aplikasi: 'REKAN_HRIS',
        status: JournalStatus.POSTED,
        entries: [
          { kode: '5-2001', tipe: EntryType.DEBIT, jumlah: 92500000 },
          { kode: '1-1002', tipe: EntryType.KREDIT, jumlah: 92500000 },
        ],
      },
    ];

    for (const j of sampleJournals) {
      await prisma.journal.create({
        data: {
          tenantId: demoTenant.id,
          no_voucher: j.no_voucher,
          tanggal: j.tanggal,
          deskripsi: j.deskripsi,
          sumber_aplikasi: j.sumber_aplikasi,
          status: j.status,
          entries: {
            create: j.entries.map((e) => ({
              chartOfAccountId: coaMap[e.kode],
              tipe: e.tipe,
              jumlah: e.jumlah,
            })),
          },
        },
      });
    }
    console.log('✅ 4 Jurnal contoh berhasil dibuat.');
  }

  console.log('\n📋 Ringkasan Akun Demo Ledgery:');
  console.log('   SSO / Admin Tenant : demo@abpcloud.my.id / demo123');
  console.log('   Admin Tenant       : admin@demo-tenant.id / tenant123');
  console.log('   Staf Akuntansi     : staf@demo-tenant.id / staf123');
  console.log('   Super Admin ABP    : admin@ledgery.id / admin123');
  console.log('\n✅ Seed selesai!');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
