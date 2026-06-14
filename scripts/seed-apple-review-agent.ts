/**
 * Creates the view-only support agent account.
 * Run: npm run seed:readonly-agent
 */
import { Gender, UserRoles } from '@prisma/client';
import { prisma } from '../src/utils/prisma';
import { hashPassword } from '../src/utils/authUtils';
import {
  VIEW_ONLY_AGENT_DEFAULT_PASSWORD,
  VIEW_ONLY_AGENT_EMAIL,
  VIEW_ONLY_AGENT_USERNAME,
} from '../src/constants/apple.review.user';

async function main() {
  const password = process.env.VIEW_ONLY_AGENT_PASSWORD || VIEW_ONLY_AGENT_DEFAULT_PASSWORD;
  const hashed = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email: VIEW_ONLY_AGENT_EMAIL },
    create: {
      username: VIEW_ONLY_AGENT_USERNAME,
      email: VIEW_ONLY_AGENT_EMAIL,
      firstname: 'Sarah',
      lastname: 'Mitchell',
      country: 'Nigeria',
      phoneNumber: '+2348099990001',
      password: hashed,
      gender: Gender.female,
      role: UserRoles.agent,
      isVerified: true,
      status: 'active',
    },
    update: {
      username: VIEW_ONLY_AGENT_USERNAME,
      firstname: 'Sarah',
      lastname: 'Mitchell',
      password: hashed,
      role: UserRoles.agent,
      isVerified: true,
      status: 'active',
    },
  });

  await prisma.agent.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  console.log('View-only support agent ready:');
  console.log(`  Email:    ${VIEW_ONLY_AGENT_EMAIL}`);
  console.log(`  Username: ${VIEW_ONLY_AGENT_USERNAME}`);
  console.log(`  Password: ${password}`);
  console.log('  Role:     agent (read-only in admin app)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
