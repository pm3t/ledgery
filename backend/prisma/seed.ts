import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Memulai proses seed database Ledgery...');

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
      tenantId: null, // Super Admin tidak terikat tenant
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

  // 3. Buat akun Admin Tenant (untuk demo)
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
  console.log('✅ Mata uang global (Currency) disiapkan.');

  console.log('\n📋 Ringkasan Akun Demo:');
  console.log('   Super Admin: admin@ledgery.id / admin123');
  console.log('   Admin Tenant: admin@demo-tenant.id / tenant123');
  console.log('   Staf Akuntansi: staf@demo-tenant.id / staf123');
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
