import { createServer } from 'http';
import { Server } from 'socket.io';
import express, { Application } from 'express';
import { verifyToken } from './utils/authUtils';
import {
  createNewChat,
  getAgentDepartmentAndAgentId,
} from './utils/socketUtils';
import { UserRoles } from '@prisma/client';

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

let onlineAgents: {
  agentId: number;
  socketId: string;
  assignedDepartments: { id: number }[];
}[] = [];
let onlineCustomers: {
  userId: number;
  socketId: string;
  departmentId: number;
  categoryId: number;
  isAgentAssigned: boolean;
}[] = [];

io.on('connection', async (socket) => {
  console.log('a user connected');

  const token = socket.handshake.query.token as string;
  const departmentId = Number(socket.handshake.query.departmentId);
  const categoryId = Number(socket.handshake.query.categoryId);
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
    if (role == 'AGENT') {
      getAgentDepartmentAndAgentId(userId)
        .then((res) => {
          if (res) {
            onlineAgents.push({
              agentId: userId,
              socketId: socket.id,
              assignedDepartments: res.assignedDepartments,
            });
          } else {
            return socket.disconnect();
          }
        })
        .catch((err) => {
          console.log(err);
          return socket.disconnect();
        });
    } else if (role === 'CUSTOMER') {
      if (!departmentId || !categoryId) return socket.disconnect();
      const isAgentAvailable = onlineAgents.find(
        (agent) =>
          agent.assignedDepartments.indexOf({ id: departmentId }) !== -1
      );

      if (isAgentAvailable) {
        try {
          const res = await createNewChat(
            isAgentAvailable.agentId,
            userId,
            categoryId,
            departmentId
          );

          if (res) {
            onlineCustomers.push({
              userId,
              socketId: socket.id,
              departmentId: departmentId,
              categoryId: categoryId,
              isAgentAssigned: true,
            });

            io.to(isAgentAvailable.socketId).emit(
              `customerAssigned_${departmentId}`,
              userId
            );
            io.to(socket.id).emit(
              `agentAssigned_${departmentId}`,
              isAgentAvailable.agentId
            );
          } else {
            onlineCustomers.push({
              userId,
              socketId: socket.id,
              departmentId,
              categoryId,
              isAgentAssigned: false,
            });
          }
        } catch (error) {
          console.log(error);
          onlineCustomers.push({
            userId,
            socketId: socket.id,
            departmentId,
            categoryId,
            isAgentAssigned: false,
          });
        }
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
    // getDepartmentFromSubDepartment(categoryId)
    // .then((department)=> {
    //   if (!department) return socket.disconnect();
    //   const isAgentAvailable = onlineAgents.find((agent) => agent.department == department);
    //   if (isAgentAvailable) {
    //   createNewChat(isAgentAvailable.userId, userId, categoryId)
    //   .then((res) => {
    //     if(res){
    //       onlineCustomers.push({
    //         userId,
    //         socketId: socket.id,
    //         department,
    //         isAgentAssigned: true,
    //       });
    //         io.to(isAgentAvailable.socketId).emit('customerAssigned', userId);
    //         io.to(socket.id).emit('agentAssigned', isAgentAvailable.userId);
    //       }else {
    //         onlineCustomers.push({
    //           userId,
    //           socketId: socket.id,
    //           department,
    //           isAgentAssigned: false,
    //         })
    //       }
    //     })
    //     .catch((err) => {
    //       console.log(err);
    //       onlineCustomers.push({
    //         userId,
    //         socketId: socket.id,
    //         department,
    //         isAgentAssigned: false,
    //       })
    //     })
    //   }else {
    //     onlineCustomers.push({
    //       userId,
    //       socketId: socket.id,
    //       department,
    //       isAgentAssigned: false,
    //     })
    //   };
    // })
    // .catch((err) => {
    //   console.log(err);
    //   onlineCustomers.push({
    //     userId,
    //     socketId: socket.id,
    //     department: '',
    //     isAgentAssigned: false,
    //   })
    // })
    // }
  } catch (error) {
    console.error('Token verification failed:', error);
    return socket.disconnect();
  }
  socket.on('disconnect', (reason) => {
    if (userRole == UserRoles.AGENT) {
      onlineAgents = onlineAgents.filter(
        (agent) => agent.socketId !== socket.id
      );
    } else if (userRole == UserRoles.CUSTOMER) {
      onlineCustomers = onlineCustomers.filter(
        (customer) => customer.socketId !== socket.id
      );
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
