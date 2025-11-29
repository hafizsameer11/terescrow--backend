# Prisma Migration Commands Guide

This document lists all Prisma migration commands used in **Development** and **Production** environments.

---

## 📋 Table of Contents
- [Development Commands](#development-commands)
- [Production Commands](#production-commands)
- [Common Commands](#common-commands)
- [Troubleshooting](#troubleshooting)

---

## 🛠️ Development Commands

### 1. Create a New Migration (Without Applying)
```bash
npm run migration:create
# or
npx prisma migrate dev --create-only
```
**Purpose:** Creates a new migration file without applying it to the database.  
**Use Case:** When you want to review the migration SQL before applying it.

### 2. Create and Apply Migration
```bash
npm run migrate
# or
npx prisma migrate dev
```
**Purpose:** Creates a new migration based on schema changes and applies it to the database.  
**Use Case:** Standard workflow when making schema changes in development.

### 3. Create Migration with Custom Name
```bash
npx prisma migrate dev --name your_migration_name
```
**Purpose:** Creates a migration with a descriptive name.  
**Example:** `npx prisma migrate dev --name add_pin_to_user`

### 4. Reset Database (⚠️ DANGER: Deletes all data)
```bash
npx prisma migrate reset
```
**Purpose:** Resets the database by dropping it, recreating it, and applying all migrations.  
**Use Case:** Only in development when you need a fresh start. **NEVER use in production!**

### 5. Apply Pending Migrations
```bash
npx prisma migrate dev
```
**Purpose:** Applies any pending migrations that haven't been run yet.

### 6. Generate Prisma Client After Schema Changes
```bash
npx prisma generate
```
**Purpose:** Regenerates the Prisma Client after schema changes.  
**Note:** Usually runs automatically with `migrate dev`, but can be run manually if needed.

### 7. View Migration Status
```bash
npx prisma migrate status
```
**Purpose:** Shows which migrations have been applied and which are pending.

### 8. Resolve Migration Issues
```bash
npx prisma migrate resolve --applied <migration_name>
# or
npx prisma migrate resolve --rolled-back <migration_name>
```
**Purpose:** Manually mark migrations as applied or rolled back if there are conflicts.

---

## 🚀 Production Commands

### 1. Deploy Migrations to Production
```bash
npm run migration:prod
# or
npx prisma migrate deploy
```
**Purpose:** Applies pending migrations to production database without creating new ones.  
**Use Case:** Standard command for production deployments.  
**⚠️ Important:** This does NOT create new migrations, only applies existing ones.

### 2. Check Migration Status in Production
```bash
npx prisma migrate status
```
**Purpose:** Verify which migrations have been applied in production.

### 3. Generate Prisma Client for Production
```bash
npx prisma generate
```
**Purpose:** Ensures Prisma Client is up-to-date with the schema.

---

## 🔧 Common Commands

### Database Introspection
```bash
npx prisma db pull
```
**Purpose:** Pulls the current database schema and updates your Prisma schema file.  
**Use Case:** When database was changed outside of Prisma migrations.

### Push Schema Changes (Development Only)
```bash
npx prisma db push
```
**Purpose:** Pushes schema changes directly to the database without creating migrations.  
**⚠️ Warning:** Only use in development. Not recommended for production.

### Format Prisma Schema
```bash
npx prisma format
```
**Purpose:** Formats your `schema.prisma` file.

### Validate Schema
```bash
npx prisma validate
```
**Purpose:** Validates your Prisma schema for errors.

### View Database in Prisma Studio
```bash
npx prisma studio
```
**Purpose:** Opens a visual database browser at `http://localhost:5555`

---

## 📝 Workflow Examples

### Development Workflow
```bash
# 1. Make changes to schema.prisma
# 2. Create and apply migration
npm run migrate

# 3. (Optional) If you want to review first
npm run migration:create
# Review the generated SQL in prisma/migrations/
# Then apply it manually or run migrate dev

# 4. Generate Prisma Client (auto with migrate dev)
npx prisma generate
```

### Production Deployment Workflow
```bash
# 1. Ensure all migrations are committed to version control
git add prisma/migrations/
git commit -m "Add new migration"

# 2. Deploy code to production server

# 3. Run production migration
npm run migration:prod

# 4. Verify migration status
npx prisma migrate status
```

---

## ⚠️ Troubleshooting

### Migration Conflicts
```bash
# Check migration status
npx prisma migrate status

# Resolve manually if needed
npx prisma migrate resolve --applied <migration_name>
```

### Database Out of Sync
```bash
# Reset in development (⚠️ deletes all data)
npx prisma migrate reset

# Or pull current schema
npx prisma db pull
```

### Prisma Client Out of Date
```bash
# Regenerate client
npx prisma generate
```

---

## 📦 NPM Scripts Reference

From `package.json`:
- `npm run migration:create` - Create migration without applying
- `npm run migrate` - Create and apply migration (dev)
- `npm run migration:prod` - Deploy migrations (production)
- `npm run seed` - Run database seed script

---

## 🔐 Environment Variables

Ensure your `.env` file has:
```env
DATABASE_URL="mysql://username:password@host:port/database_name"
```

The `prisma.config.ts` file reads from `process.env.DATABASE_URL`.

---

## 📚 Additional Resources

- [Prisma Migrate Docs](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Prisma CLI Reference](https://www.prisma.io/docs/reference/api-reference/command-reference)

---

**Last Updated:** January 2025  
**Prisma Version:** 7.0.1

