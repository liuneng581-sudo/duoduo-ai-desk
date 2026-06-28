import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create admin user — password from env, random fallback (never hardcode)
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
    || require('crypto').randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@pdd-ai.com' },
    update: {},
    create: {
      email: 'admin@pdd-ai.com',
      passwordHash,
      name: '管理员',
      role: 'admin',
    },
  });
  console.log(`  ✅ User: ${user.email}`);

  // Create demo store
  const store = await prisma.store.upsert({
    where: { userId_shopId: { userId: user.id, shopId: 'demo-shop-001' } },
    update: {},
    create: {
      userId: user.id,
      name: 'Demo 拼多多店铺',
      shopId: 'demo-shop-001',
      description: '这是一个演示店铺，用于测试 AI 客服功能',
      status: 'active',
    },
  });
  console.log(`  ✅ Store: ${store.name}`);

  // Create demo customers
  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        storeId: store.id,
        name: '张三',
        phone: '13800000001',
        tags: JSON.stringify(['vip']),
      },
    }),
    prisma.customer.create({
      data: {
        storeId: store.id,
        name: '李四',
        phone: '13800000002',
        tags: JSON.stringify(['new']),
      },
    }),
  ]);
  console.log(`  ✅ Customers: ${customers.length} created`);

  // Create demo products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        storeId: store.id,
        name: '女士夏季连衣裙',
        description: '时尚碎花连衣裙，V领设计，A字裙摆，舒适透气面料。适合日常通勤和休闲场合。尺码：S-L，颜色：红/蓝/黑',
        price: 89.90,
        stock: 500,
        category: '女装',
        status: 'on_sale',
      },
    }),
    prisma.product.create({
      data: {
        storeId: store.id,
        name: '男士纯棉T恤',
        description: '100%新疆长绒棉，亲肤透气，不变形不缩水。经典圆领，多色可选。尺码：M-3XL',
        price: 59.90,
        stock: 1000,
        category: '男装',
        status: 'on_sale',
      },
    }),
    prisma.product.create({
      data: {
        storeId: store.id,
        name: '无线蓝牙耳机',
        description: '蓝牙5.3，超长续航48小时，Hi-Fi音质，IPX5防水。Type-C快充，支持降噪。',
        price: 129.00,
        stock: 300,
        category: '数码',
        status: 'on_sale',
      },
    }),
  ]);
  console.log(`  ✅ Products: ${products.length} created`);

  console.log('\n🎉 Seed complete!');
  console.log(`   Login: admin@pdd-ai.com / ${adminPassword}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('   ⚠️  Password was randomly generated (SEED_ADMIN_PASSWORD not set). Save it now.');
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
