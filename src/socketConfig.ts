import { createServer } from 'http';
import { Server } from 'socket.io';
import express, { Application } from 'express';
import { verifyToken } from './utils/authUtils';
import {
  checkPendingChat,
  createCustomerToAgentChat,
  getAgentDepartments,
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
}[] = [];

let pendingAssignments: {
  customerId: number;
  socketId: string;
  departmentId: number;
  categoryId: number;
}[] = [];

const prisma = new PrismaClient();

io.on('connection', async (socket) => {
  console.log('a user connected');

  const token = socket.handshake.query.token as string;

  if (!token) {
    return socket.disconnect();
  }
  let userRole: UserRoles;
  let currUser: {
    id: number;
    role: UserRoles;
  };

  try {
    const decoded = await verifyToken(token);
    if (!decoded) {
      return socket.disconnect();
    }
    const { id: userId, role } = decoded;
    userRole = role;
    if (!role) return socket.disconnect();

    currUser = {
      id: userId,
      role,
    };

    if (role == 'admin') {
      isAdminOnline = {
        socketId: socket.id,
        userId,
      };

      console.log('admin connected');

      socket.broadcast.emit('adminJoined', {
        userId: userId,
        socketId: socket.id,
      });
    }

    if (role == 'agent') {
      console.log('new agent connected');

      getAgentDepartments(userId)
        .then((res) => {
          if (res) {
            // console.log('new agent:', res.assignedDepartments);
            onlineAgents.push({
              agentId: userId,
              socketId: socket.id,
              assignedDepartments: res.assignedDepartments,
            });

            console.log('AgentConnected: ', res);

            socket.broadcast.emit('newAgentJoined', {
              userId: userId,
              socketId: socket.id,
              assignedDepartments: res.assignedDepartments,
            });

            socket.to(socket.id).emit('onlineUsers', {
              customers: onlineCustomers,
              agents: onlineAgents,
              admin: isAdminOnline,
            });

            //assign agent if customer is available
            if (pendingAssignments.length > 0) {
              let assigned = false;
              let index = 0;
              do {
                const assignment = pendingAssignments[index];
                if (
                  res.assignedDepartments.some(
                    (department) => department.id == assignment.departmentId
                  )
                ) {
                  createCustomerToAgentChat(
                    res.agentId,
                    assignment.customerId,
                    assignment.departmentId,
                    assignment.categoryId
                  ).then((chatRes) => {
                    if (chatRes) {
                      io.to(assignment.socketId).emit(
                        `agentAssigned`,
                        res.agentId
                      );
                      io.to(socket.id).emit(
                        `customerAssigned`,
                        assignment.customerId
                      );
                      assigned = true;
                      console.log('AgentAssigned to customer');
                    }
                  });
                }

                index++;
              } while (assigned == false && index < pendingAssignments.length);
            }
          } else {
            console.log('no assigned departments');
            return socket.disconnect();
          }
        })
        .catch((err) => {
          console.log(err);
          return socket.disconnect();
        });
    }

    if (role == 'customer') {
      console.log('new customer connected');
      onlineCustomers.push({
        userId: userId,
        socketId: socket.id,
      });

      socket.to(socket.id).emit('onlineUsers', {
        agents: onlineAgents,
        admin: isAdminOnline,
      });
      socket.broadcast.emit('newCustomerJoined', {
        userId: userId,
        socketId: socket.id,
      });

      socket.on(
        'requestAssignment',
        async (data: { departmentId: string; categoryId: string }) => {
          console.log('requestAssignment');
          const isPendingChat = await checkPendingChat(
            Number(userId),
            Number(data.departmentId),
            Number(data.categoryId)
          );
          if (isPendingChat) {
            io.to(socket.id).emit('alreadyPendingChat', isPendingChat);
          } else {
            const availableAgents = onlineAgents.filter((agent) =>
              agent.assignedDepartments.some(
                (department) => department.id == Number(data.departmentId)
              )
            );
            if (availableAgents.length > 0) {
              const newChat = await createCustomerToAgentChat(
                availableAgents[0].agentId,
                userId,
                Number(data.departmentId),
                Number(data.categoryId)
              );
              if (newChat) {
                io.to(socket.id).emit('agentAssigned', newChat);
                io.to(availableAgents[0].socketId).emit(
                  'customerAssigned',
                  userId
                );
              } else {
                pendingAssignments.push({
                  customerId: userId,
                  socketId: socket.id,
                  departmentId: Number(data.departmentId),
                  categoryId: Number(data.categoryId),
                });
              }
            } else {
              pendingAssignments.push({
                customerId: userId,
                socketId: socket.id,
                departmentId: Number(data.departmentId),
                categoryId: Number(data.categoryId),
              });
            }
          }
        }
      );
    }
  } catch (error) {
    console.error('Token verification failed:', error);
    return socket.disconnect();
  }
  socket.on('disconnect', (reason) => {
    socket.broadcast.emit('user-disconnected', currUser);
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
  console.log(agent);
  if (agent) return agent.socketId;
  return '';
};

export { io, httpServer, app, getCustomerSocketId, getAgentSocketId };
