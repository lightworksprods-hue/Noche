const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function createSuperAdmin() {
  console.log('👑 Creating Global SuperAdmin account...');
  
  try {
    const email = process.env.SUPERADMIN_EMAIL || 'superadmin@elevatepos.com';
    const plainPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
    const password = await bcrypt.hash(plainPassword, 12);
    
    // Check if superadmin exists (where tenantId is null)
    let user = await prisma.user.findFirst({
      where: { email }
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { password, role: 'superadmin', active: true, isVerified: true, tenantId: null }
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          password: password,
          name: 'Master SuperAdmin',
          role: 'superadmin',
          active: true,
          isVerified: true,
          tenantId: null
        }
      });
    }

    console.log('✅ SUPERADMIN CREATED SUCCESSFULLY!');
    console.log(`📧 Email: ${email}`);
    console.log('🔑 Password: [the password supplied to the setup script]');
    console.log('🌐 Dashboard: /superadmin');
  } catch (error) {
    console.error('❌ Failed to create SuperAdmin:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();
