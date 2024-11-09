import { PrismaClient } from '@prisma/client';
import ApiError from './ApiError';
const primsa = new PrismaClient();

const getAgentDepartment = async (username: string) => {
  try {
    const isAgent = await primsa.user.findUnique({
      where: {
        username,
      },
    });
    if (!isAgent) return '';
    return isAgent.role;
  } catch (error) {
    console.log(error);
    return '';
    // throw ApiError.badRequest('Internal server error');
  }
};

const createNewChat = async (
  agentUsername: string,
  customerUsername: string,
  subDepartmentId: number
) => {
  try {
    const agent = await primsa.user.findUnique({
      where: {
        username: agentUsername,
        role: 'AGENT',
      },
      include: {
        agent: true,
      },
    });
    const customer = await primsa.user.findUnique({
      where: {
        username: customerUsername,
        role: 'CUSTOMER',
      },
    });
    if (!agent?.agent || !customer) {
      return false;
    }

    const chat = await primsa.chat.create({
      data: {
        agentId: agent.agent.id,
        customerId: customer.id,
        subDepartmentId,
      },
    });
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

const getDepartmentFromSubDepartment = async (subDepartmentId: number) => {
  try {
    const subDepartment = await primsa.subDepartment.findUnique({
      where: {
        id: subDepartmentId,
      },
      include: {
        department: true,
      },
    });
    if (!subDepartment) {
      throw ApiError.internal('Internal server error');
    }
    return subDepartment.department.name;
  } catch (error) {
    console.log(error);
    ApiError.internal('Internal server error');
  }
};

export { getAgentDepartment, createNewChat, getDepartmentFromSubDepartment };
