# Swagger API Documentation Setup

## ✅ Implementation Complete

Your API documentation is now fully set up and ready to use!

---

## 🚀 Quick Start

1. **Start your server:**
   ```bash
   npm run dev
   ```

2. **Access Swagger UI:**
   - Open your browser and navigate to: **http://localhost:8000/api-docs**
   - You'll see an interactive API documentation interface

3. **Test Endpoints:**
   - Browse all available endpoints organized by tags
   - Click "Try it out" on any endpoint
   - Fill in the request parameters
   - Execute and see the response

---

## 📋 What's Documented

### ✅ Completed Routes

1. **Customer Auth Routes** (`/api/auth`)
   - Register customer
   - Login/Logout
   - Email verification
   - Password reset
   - Profile management
   - PIN management (set/update)
   - KYC submission
   - Notifications

2. **Public Routes** (`/api/public`)
   - Login
   - Departments
   - Categories
   - Subcategories
   - Countries
   - Notifications
   - Messages

3. **Customer Chat Routes** (`/api/customer`)
   - Send message
   - Get chat details
   - Get all chats

### 📝 Remaining Routes (Can be added later)

- Agent routes (`/api/agent`)
- Admin routes (`/api/admin`)
- Customer utilities (`/api/customer/utilities`)

---

## 🔐 Authentication

Swagger UI supports two authentication methods:

1. **Bearer Token** (Header)
   - Click the "Authorize" button (🔒) at the top
   - Enter your JWT token
   - Token will be included in all requests

2. **Cookie Authentication**
   - Login first using `/api/public/login`
   - Cookie will be automatically set
   - Subsequent requests will use the cookie

---

## 📁 Files Modified/Created

### Created Files:
- `src/config/swagger.config.ts` - Swagger configuration
- `API_DOCUMENTATION.md` - Markdown API reference
- `SWAGGER_SETUP.md` - This file

### Modified Files:
- `src/index.ts` - Added Swagger UI endpoint
- `src/routes/cutomer/auth.router.ts` - Added Swagger annotations
- `src/routes/public.router.ts` - Added Swagger annotations
- `src/routes/cutomer/chat.router.ts` - Added Swagger annotations
- `src/utils/authUtils.ts` - Fixed Prisma Client import
- `src/middlewares/authenticate.user.ts` - Fixed Prisma Client import
- `src/controllers/customer/auth.controllers.ts` - Fixed Prisma Client import
- `src/utils/prisma.ts` - Created singleton Prisma Client

---

## 🛠️ How to Add More Documentation

To document additional routes, add Swagger JSDoc comments above each route:

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   post:
 *     summary: Brief description
 *     tags: [Your Tag]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success response
 */
router.post('/your-endpoint', controller);
```

---

## 📚 Swagger UI Features

1. **Interactive Testing**
   - Test endpoints directly from the browser
   - See request/response examples
   - Validate your API

2. **Schema Documentation**
   - View request/response schemas
   - See data types and validation rules
   - Understand required vs optional fields

3. **Authentication**
   - Easy token management
   - Test authenticated endpoints
   - Cookie support

4. **Export Options**
   - Export OpenAPI spec (JSON/YAML)
   - Share with frontend developers
   - Import into Postman/Insomnia

---

## 🔧 Configuration

Swagger configuration is in `src/config/swagger.config.ts`:

- **Title**: TereScrow Backend API
- **Version**: 1.0.0
- **Servers**: 
  - Development: http://localhost:8000
  - Production: https://api.terescrow.com
- **Security Schemes**: Bearer token & Cookie auth

---

## 📖 Additional Resources

- **Swagger UI (Live)**: http://localhost:8000/api-docs
- **Markdown Docs**: See `API_DOCUMENTATION.md`
- **Swagger JSDoc**: https://github.com/Surnet/swagger-jsdoc
- **OpenAPI Spec**: https://swagger.io/specification/
- **Reloadly API Docs (Reference)**: https://docs.reloadly.com/

---

## 🐛 Troubleshooting

### Swagger UI not loading?
- Ensure server is running: `npm run dev`
- Check console for errors
- Verify port 8000 is available

### Endpoints not showing?
- Check that JSDoc comments are properly formatted
- Verify file paths in `swagger.config.ts` match your route files
- Restart the server after adding new annotations

### Authentication not working?
- Make sure you've logged in first
- Check token format (should be JWT)
- Verify middleware is properly configured

---

## ✨ Next Steps

1. **Add remaining routes**: Document agent and admin routes
2. **Add examples**: Include more request/response examples
3. **Add error responses**: Document all possible error codes
4. **Export spec**: Generate OpenAPI JSON for frontend team

---

**Last Updated**: January 2025  
**Status**: ✅ Active and Working

