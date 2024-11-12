import { createServer } from 'http';
import { Server } from 'socket.io';
import express, { Application } from 'express';
import { verifyToken } from './utils/authUtils';
import {
  createNewChat,
  getAgentDepartment,
  getDepartmentFromSubDepartment,
} from './utils/socketUtils';
import ApiError from './utils/ApiError';

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

let onlineAgents: { username: string; socketId: string; department: string }[] =
  [];
let onlineCustomers: {
  username: string;
  socketId: string;
  department: string;
  isAgentAssigned: boolean;
}[] = [];

io.on('connection', async (socket) => {
  console.log('a user connected');

  const token = socket.handshake.query.token as string;
  const subDepartmentId = Number(socket.handshake.query.subDepartmentId);
  if (!token) {
    return socket.disconnect();
  }
  let UserRole: 'ADMIN' | 'AGENT' | 'CUSTOMER' | undefined;
  try {
    const decoded = await verifyToken(token);
    if (!decoded) {
      return socket.disconnect();
    }
    const { username, role } = decoded;
    UserRole = role;
    if (role == 'ADMIN') {
      getAgentDepartment(username)
        .then((res) => {
          if (res) {
            onlineAgents.push({
              username,
              socketId: socket.id,
              department: res,
            });
          } else {
            return socket.disconnect();
          }
        })
        .catch((err) => {
          return socket.disconnect();
        });
    } else if (role === 'CUSTOMER') {
      if (!subDepartmentId) return socket.disconnect();
      try {
        const department = await getDepartmentFromSubDepartment(
          subDepartmentId
        );

        if (!department) {
          return socket.disconnect();
        }

        const isAgentAvailable = onlineAgents.find(
          (agent) => agent.department == department
        );

        if (isAgentAvailable) {
          try {
            const res = await createNewChat(
              isAgentAvailable.username,
              username,
              subDepartmentId
            );

            if (res) {
              onlineCustomers.push({
                username,
                socketId: socket.id,
                department,
                isAgentAssigned: true,
              });

              io.to(isAgentAvailable.socketId).emit(
                `customerAssigned_${department}`,
                username
              );
              io.to(socket.id).emit(
                `agentAssigned_${department}`,
                isAgentAvailable.username
              );
            } else {
              onlineCustomers.push({
                username,
                socketId: socket.id,
                department,
                isAgentAssigned: false,
              });
            }
          } catch (error) {
            console.log(error);
            onlineCustomers.push({
              username,
              socketId: socket.id,
              department,
              isAgentAssigned: false,
            });
          }
        } else {
          onlineCustomers.push({
            username,
            socketId: socket.id,
            department,
            isAgentAssigned: false,
          });
        }
        // io.to([])
      } catch (error) {
        console.log(error);
        return socket.disconnect();
      }
    }
    // getDepartmentFromSubDepartment(subDepartmentId)
    // .then((department)=> {
    //   if (!department) return socket.disconnect();
    //   const isAgentAvailable = onlineAgents.find((agent) => agent.department == department);
    //   if (isAgentAvailable) {
    //   createNewChat(isAgentAvailable.username, username, subDepartmentId)
    //   .then((res) => {
    //     if(res){
    //       onlineCustomers.push({
    //         username,
    //         socketId: socket.id,
    //         department,
    //         isAgentAssigned: true,
    //       });
    //         io.to(isAgentAvailable.socketId).emit('customerAssigned', username);
    //         io.to(socket.id).emit('agentAssigned', isAgentAvailable.username);
    //       }else {
    //         onlineCustomers.push({
    //           username,
    //           socketId: socket.id,
    //           department,
    //           isAgentAssigned: false,
    //         })
    //       }
    //     })
    //     .catch((err) => {
    //       console.log(err);
    //       onlineCustomers.push({
    //         username,
    //         socketId: socket.id,
    //         department,
    //         isAgentAssigned: false,
    //       })
    //     })
    //   }else {
    //     onlineCustomers.push({
    //       username,
    //       socketId: socket.id,
    //       department,
    //       isAgentAssigned: false,
    //     })
    //   };
    // })
    // .catch((err) => {
    //   console.log(err);
    //   onlineCustomers.push({
    //     username,
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
    if (UserRole == 'ADMIN') {
      onlineAgents = onlineAgents.filter(
        (agent) => agent.socketId !== socket.id
      );
    } else if (UserRole == 'CUSTOMER') {
      onlineCustomers = onlineCustomers.filter(
        (customer) => customer.socketId !== socket.id
      );
    }
    console.log('User disconnected: ', reason);
  });
});

const getSocketId = (username: string) => {
  const customer = onlineCustomers.find(
    (customer) => customer.username == username
  );
  const agent = onlineAgents.find((agent) => agent.username == username);
  if (customer) return customer.socketId;
  if (agent) return agent.socketId;
  return '';
};

export { io, httpServer, app, getSocketId };
