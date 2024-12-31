import express, { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { io } from '../../socketConfig';
import { Chat, ChatStatus, ChatType, PrismaClient, TransactionStatus, User, UserRoles } from '@prisma/client';
const prisma = new PrismaClient();

// const createRoles=async(req:Request,res:Response,next:NextFunction)=>{
export const createRoles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name } = req.body;
        if (!name) {
            return next(ApiError.internal('Agent creation failed'));
        }
        if (name == "admin" || name == "agent" || name == "customer" || name == "other") {
            return next(ApiError.internal('You Cannot Create This Role'));
        }
        const eixistingRole = await prisma.customRole.findUnique({
            where: {
                name: name
            }
        })
        if (eixistingRole) {
            return next(ApiError.badRequest('Role already exists'))
        }

        //create new role
        const role = await prisma.customRole.create({
            data: {
                name: name
            }
        })
        if (!role) {
            return next(ApiError.internal('Role creation failed'));
        }
        return new ApiResponse(200, role, 'Role created successfully').send(res);


    } catch (error) {
        console.log(error);
        if (error instanceof ApiError) {
            return next(error);
        }
        next(ApiError.internal('Internal Server Error'));
    }
}


export const addOrUpdateRolePermissions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { roleName, permissions } = req.body;

        // Validate input
        if (!roleName || !permissions || !Array.isArray(permissions)) {
            return next(ApiError.badRequest('Role name and permissions are required.'));
        }

        // Check if the role exists
        const role = await prisma.customRole.findUnique({
            where: { name: roleName },
        });

        if (!role) {
            return next(ApiError.badRequest(`Role '${roleName}' does not exist.`));
        }

        for (const perm of permissions) {
            const existingPermission = await prisma.rolePermission.findFirst({
                where: {
                    roleId: role.id,
                    moduleName: perm.moduleName,
                },
            });

            if (existingPermission) {
                // Update existing permission
                await prisma.rolePermission.update({
                    where: { id: existingPermission.id },
                    data: {
                        canCreate: perm.canCreate || false,
                        canUpdate: perm.canUpdate || false,
                        canDelete: perm.canDelete || false,
                        canSee: perm.canSee || false,
                    },
                });
            } else {
                // Create new permission
                await prisma.rolePermission.create({
                    data: {
                        roleId: role.id,
                        moduleName: perm.moduleName,
                        canCreate: perm.canCreate || false,
                        canUpdate: perm.canUpdate || false,
                        canDelete: perm.canDelete || false,
                        canSee: perm.canSee || false,
                    },
                });
            }
        }

        return new ApiResponse(200, 'Permissions updated successfully.', 'Permissions successfully updated or created for the role.').send(res);
    } catch (error) {
        console.error('Error assigning permissions:', error);

        if (error instanceof ApiError) {
            return next(error);
        }

        next(ApiError.internal('Internal Server Error'));
    }
};


export const getRoles = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Fetch all custom roles and their permissions
        const roles = await prisma.customRole.findMany({
            include: {
                permissions: true, // Include associated permissions
            },
        });

        if (!roles) {
            return next(ApiError.internal('No roles found.'));
        }

        return new ApiResponse(200, roles, 'Roles fetched successfully.').send(res);
    } catch (error) {
        console.error('Error fetching roles:', error);

        if (error instanceof ApiError) {
            return next(error);
        }

        return next(ApiError.internal('Failed to fetch roles.'));
    }
};