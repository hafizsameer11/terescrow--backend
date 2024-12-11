import { createServer } from 'http';
import { Server } from 'socket.io';
import express, { Application } from 'express';
import { verifyToken } from './utils/authUtils';
import {
  checkPendingChat,
  createCustomerToAgentChat,
  getAgentDepartmentAndAgentId,
} from './utils/socketUtils';
import { PrismaClient, UserRoles } from '@prisma/client';

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST'],
  },
});

let onlineAgents: {
  agentId: number;
  socketId: string;
  assignedDepartments: { id: number }[];
}[] = [];

let isAdminOnline:
  | {
      socketId: string;
      userId: number;
    }
  | false = false;

let onlineCustomers: {
  userId: number;
  socketId: string;
  departmentId: number;
  categoryId: number;
  isAgentAssigned: boolean;
}[] = [];

const prisma = new PrismaClient();

io.on('connection', async (socket) => {
  console.log('a user connected');

  const token = socket.handshake.query.token as string;
  const departmentId = Number(socket.handshake.query.departmentId);
  const categoryId = Number(socket.handshake.query.categoryId);
  const subCategoryId = Number(socket.handshake.query.subCategoryId);
  if (!token) {
    return socket.disconnect();
  }
  let userRole: UserRoles;
  try {
    const decoded = await verifyToken(token);
    if (!decoded) {
      return socket.disconnect();
    }
    const { id: userId, role } = decoded;
    userRole = role;
    if (!role) return socket.disconnect();

    if (role == 'admin') {
      isAdminOnline = {
        socketId: socket.id,
        userId,
      };
    }
    if (role == 'agent') {
      getAgentDepartmentAndAgentId(userId)
        .then((res) => {
          if (res) {
            // console.log('new agent:', res.assignedDepartments);
            onlineAgents.push({
              agentId: userId,
              socketId: socket.id,
              assignedDepartments: res.assignedDepartments,
            });
            console.log(
              'AgentConnected: ',
              onlineAgents[0].assignedDepartments
            );

            //assign agent if customer is available
            if (onlineCustomers.length > 0) {
              onlineCustomers.map((customer, index) => {
                let assignment = false;
                if (
                  !assignment &&
                  !customer.isAgentAssigned &&
                  res.assignedDepartments.includes({
                    id: customer.departmentId,
                  })
                ) {
                  createCustomerToAgentChat(
                    res.agentId,
                    customer.userId,
                    customer.departmentId,
                    customer.categoryId
                  ).then((chatRes) => {
                    if (chatRes) {
                      io.to(customer.socketId).emit(`agentAssigned`, userId);
                      io.to(socket.id).emit(
                        `customerAssigned`,
                        customer.userId
                      );
                      assignment = true;
                      console.log('AgentAssigned to customer');
                      return {
                        ...customer,
                        isAgentAssigned: true,
                      };
                    } else {
                      return customer;
                    }
                  });
                }
                return customer;
              });
            }
          } else {
            return socket.disconnect();
          }
        })
        .catch((err) => {
          console.log(err);
          return socket.disconnect();
        });
    }
    if (role == 'customer') {
      if (!departmentId || !categoryId) return socket.disconnect();
      console.log(
        onlineAgents.forEach((agent) =>
          console.log(
            agent.assignedDepartments.forEach((dep) =>
              console.log('agent dep: ', dep.id)
            )
          )
        )
      );
      console.log('customerDepartment: ', departmentId);
      let isAgentAvailable: any = null;

      onlineAgents.forEach((agent) => {
        agent.assignedDepartments.forEach((dep) => {
          if (dep.id == departmentId) {
            isAgentAvailable = agent;
          }
        });
      });
      // const isAgentAvailable = onlineAgents.find(
      //   (agent) =>
      //     agent.assignedDepartments.indexOf({ id: departmentId }) !==
      //     -1
      // );

      console.log('Agent is available: ', isAgentAvailable);

      if (isAgentAvailable) {
        const isChatAlreadyPending = await checkPendingChat(
          isAgentAvailable.agentId,
          userId,
          departmentId,
          categoryId
        ); // return chatId as string or null if not exists
        if (isChatAlreadyPending) {
          onlineCustomers.push({
            userId,
            socketId: socket.id,
            departmentId,
            categoryId,
            isAgentAssigned: true,
          });
          console.log('Your agent is online', onlineCustomers);
          io.to(socket.id).emit(`agentOnline`, isChatAlreadyPending);
          io.to(isAgentAvailable.socketId).emit(
            `customerOnline`,
            isChatAlreadyPending
          ); // passed chat id
        } else {
          const res = await createCustomerToAgentChat(
            isAgentAvailable.agentId,
            userId,
            departmentId,
            categoryId
          ); // return chatId as string or null if not created
          if (res) {
            onlineCustomers.push({
              userId,
              socketId: socket.id,
              departmentId: departmentId,
              categoryId: categoryId,
              isAgentAssigned: true,
            });
            io.to(isAgentAvailable.socketId).emit(`customerAssigned`, userId);
            io.to(socket.id).emit(`agentAssigned`, res);
            console.log('agent assigned to customer', onlineCustomers);
          } else {
            onlineCustomers.push({
              userId,
              socketId: socket.id,
              departmentId,
              categoryId,
              isAgentAssigned: false,
            });
          }
        }
      } else {
        onlineCustomers.push({
          userId,
          socketId: socket.id,
          departmentId,
          categoryId,
          isAgentAssigned: false,
        });

        console.log('Custmer connect without assignment', onlineCustomers);
      }
    }
  } catch (error) {
    console.error('Token verification failed:', error);
    return socket.disconnect();
  }
  socket.on('disconnect', (reason) => {
    if (userRole == UserRoles.agent) {
      onlineAgents = onlineAgents.filter(
        (agent) => agent.socketId !== socket.id
      );
    } else if (userRole == UserRoles.customer) {
      onlineCustomers = onlineCustomers.filter(
        (customer) => customer.socketId !== socket.id
      );
    } else if (userRole == UserRoles.admin) {
      isAdminOnline = false;
    }
    console.log('User disconnected: ', reason);
  });
});

const getCustomerSocketId = (customerId: number) => {
  const customer = onlineCustomers.find(
    (customer) => customer.userId == customerId
  );
  if (customer) return customer.socketId;
  return '';
};

const getAgentSocketId = (agentId: number) => {
  const agent = onlineAgents.find((agent) => agent.agentId == agentId);
  if (agent) return agent.socketId;
  return '';
};

export { io, httpServer, app, getCustomerSocketId, getAgentSocketId };
