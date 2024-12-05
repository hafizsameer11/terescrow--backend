import { PrismaClient } from '@prisma/client';
import {
  amazonItems,
  cardData,
  COUNTRIES,
  cryptoData,
  cryptoDataArray,
  departmentData,
  getRandomItems,
} from './dummyData';

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

const deleteItems = async () => {
  await prisma.category.deleteMany({
    where: {
      id: {
        lte: 18,
      },
    },
  });
};

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
        lte: 26,
      },
    },
  });

  cardCategories.forEach((cat) => {
    createCatSub(cat);
  });
};
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
        gt: 26,
      },
    },
  });

  cryptoCategories.forEach((cat) => {
    createCatSub(cat);
  });
};

const deleteUnc = async () => {
  await prisma.catDepart.deleteMany({
    where: {
      categoryId: {
        gt: 26,
      },
    },
  });
};

const createSubCategories = async () => {
  await prisma.subcategory.createMany({
    data: amazonItems,
  });
  //   const data = cryptoDataArray.map((item) => ({
  //     title: item.title,
  //     price: item.price,
  //   }));
  //   await prisma.subcategory.createMany({
  //     data: data,
  //   });
};

const catSubCatCrypto = async () => {
  const cryptoSubcat = await prisma.subcategory.findMany({
    where: {
      id: {
        lte: 10,
      },
    },
  });

  const cryptoCategories = await prisma.category.findMany({
    where: {
      id: {
        gt: 27,
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
const catSubCatGift = async () => {
  const giftSubcat = await prisma.subcategory.findMany({
    where: {
      id: {
        gt: 10,
      },
    },
  });

  const giftCategories = await prisma.category.findMany({
    where: {
      id: {
        lte: 26,
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

catSubCatGift()
  .then(() => console.log('created successfully'))
  .catch((err) => {
    console.log(err);
    prisma.$disconnect();
    process.exit(1);
  });
