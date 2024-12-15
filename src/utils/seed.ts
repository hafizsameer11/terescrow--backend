import { ChatType, PrismaClient } from '@prisma/client';
import {
  amazonItems,
  cardData,
  COUNTRIES,
  cryptoData,
  cryptoDataArray,
  departmentData,
  getRandomItems,
} from './dummyData';
import { create } from 'domain';

const prisma = new PrismaClient();

async function createDepartments() {
  for (const department of departmentData) {
    await prisma.department.create({
      data: {
        icon: department.icon,
        description: department.text,
        title: department.heading,
      },
    });
  }
}

// createDepartments();

async function createItems() {
  for (const item of cardData) {
    await prisma.category.create({
      data: {
        title: item.text,
        image: item.card,
      },
    });
  }
  for (const item of cryptoData) {
    await prisma.category.create({
      data: {
        title: item.heading,
        image: item.icon,
        subTitle: item.text,
      },
    });
  }
}

// createItems()
//   .then(() => console.log('done'))
//   .catch((err) => console.log(err));

// const deleteItems = async () => {
//   await prisma.category.deleteMany({
//     where: {
//       id: {
//         lte: 18,
//       },
//     },
//   });
// };

const createCatDeptForGCs = async () => {
  const createCatSub = async (cat: any) => {
    await prisma.catDepart.createMany({
      data: [
        {
          departmentId: 1,
          categoryId: cat.id,
        },
        {
          departmentId: 2,
          categoryId: cat.id,
        },
      ],
    });
  };
  const cardCategories = await prisma.category.findMany({
    where: {
      id: {
        lte: 8,
      },
    },
  });

  cardCategories.forEach((cat) => {
    createCatSub(cat);
  });
};
// createCatDeptForGCs().then(() => console.log('created successfully'));
// createCatDeptForCrypto()

const createCatDeptForCrypto = async () => {
  const createCatSub = async (cat: any) => {
    await prisma.catDepart.createMany({
      data: [
        {
          departmentId: 3,
          categoryId: cat.id,
        },
        {
          departmentId: 4,
          categoryId: cat.id,
        },
      ],
    });
  };
  const cryptoCategories = await prisma.category.findMany({
    where: {
      id: {
        gt: 8,
      },
    },
  });

  cryptoCategories.forEach((cat) => {
    createCatSub(cat);
  });
};
// createCatDeptForCrypto()
//   .then(() => console.log('created successfully'))
//   .catch((err) => {
//     console.log(err);
//     prisma.$disconnect();
//     process.exit(1);
//   });

// const deleteUnc = async () => {
//   await prisma.catDepart.deleteMany({
//     where: {
//       categoryId: {
//         gt: 26,
//       },
//     },
//   });
// };

const createSubCategories = async () => {
  await prisma.subcategory.createMany({
    data: amazonItems,
  });
  const data = cryptoDataArray.map((item) => ({
    title: item.title,
    price: item.price,
  }));
  await prisma.subcategory.createMany({
    data: data,
  });
};
// createSubCategories()
//   .then(() => console.log('done'))
//   .catch((err) => console.log(err));

const catSubCatCrypto = async () => {
  const cryptoSubcat = await prisma.subcategory.findMany({
    where: {
      id: {
        gt: 7,
      },
    },
  });

  const cryptoCategories = await prisma.category.findMany({
    where: {
      id: {
        gt: 8,
      },
    },
  });

  for (const crypto of cryptoSubcat) {
    for (const cryptoCat of getRandomItems(cryptoCategories)) {
      await prisma.catSubcat.create({
        data: {
          categoryId: cryptoCat.id,
          subCategoryId: crypto.id,
        },
      });
    }
  }
};

// catSubCatCrypto()
//   .then(() => console.log('done'))
//   .catch((err) => console.log(err));

const catSubCatGift = async () => {
  const giftSubcat = await prisma.subcategory.findMany({
    where: {
      id: {
        lt: 8,
      },
    },
  });

  const giftCategories = await prisma.category.findMany({
    where: {
      id: {
        lte: 8,
      },
    },
  });

  for (const gift of giftSubcat) {
    for (const giftCat of getRandomItems(giftCategories)) {
      console.log('categoryId :', giftCat.id);
      console.log('subCatId :', gift.id);
      await prisma.catSubcat.create({
        data: {
          categoryId: giftCat.id,
          subCategoryId: gift.id,
        },
      });
    }
  }
};

// catSubCatGift()
//   .then(() => console.log('done'))
//   .catch((err) => console.log(err));

// const deleteUser = async () => {
//   await prisma.user.deleteMany({
//     where: {
//       id: {
//         gt: 1,
//       },
//     },
//   });
// };

// import { ChatType, PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();

// const main = async () => {
//   const deleteMessages = await prisma.message.deleteMany({});
//   const deleteChatDetails = await prisma.chatDetails.deleteMany({});
//   const deleteParticipants = await prisma.chatParticipant.deleteMany({});
//   const deletChat = await prisma.chat.deleteMany({
//     where: {
//       chatType: ChatType.customer_to_agent,
//     },
//   });
// const departments = await prisma.department.findMany({});
// console.log(departments);
// }

const deleteChats = async () => {
  const deleteMessages = await prisma.message.deleteMany({});
  const deleteChatDetails = await prisma.chatDetails.deleteMany({});
  const deleteParticipants = await prisma.chatParticipant.deleteMany({});
  const deletChat = await prisma.chat.deleteMany({
    where: {
      chatType: ChatType.customer_to_agent,
    },
  });
};

const createCountries = async () => {
  const countries = COUNTRIES.map((country, index) => ({
    id: index + 1,
    title: country.label,
  }));
  await prisma.country.createMany({
    data: countries,
  });
};

const deleteAgent = async (userId: number) => {
  const agent = await prisma.agent.findUnique({
    where: {
      userId,
    },
  });
  if (agent) {
    await prisma.assignedDepartment.deleteMany({
      where: {
        agentId: agent.id,
      },
    });
  }
  await prisma.agent.delete({
    where: {
      userId,
    },
  });
};
// createCountries()
//   .then(() => console.log('done'))
//   .catch((err) => console.log(err));

// deleteChats()
//   .then(() => console.log('done'))
//   .catch((err) => console.log(err));

deleteAgent(4)
  .then(() => console.log('done'))
  .catch((err) => console.log(err));
