#!/bin/bash
# ChatFlow - Deploy to Vercel with PostgreSQL
# Run this script locally before pushing to GitHub

set -e

echo "🚀 ChatFlow Deployment Setup"
echo "============================="

# Step 1: Copy PostgreSQL schema
echo ""
echo "📦 Step 1: Setting up PostgreSQL schema..."
cp prisma/schema.postgres.prisma prisma/schema.prisma
echo "✅ PostgreSQL schema ready"

# Step 2: Generate Prisma Client
echo ""
echo "⚙️ Step 2: Generating Prisma Client..."
npx prisma generate
echo "✅ Prisma Client generated"

# Step 3: Push schema to database
echo ""
echo "🗄️ Step 3: Pushing schema to database..."
npx prisma db push
echo "✅ Database schema synced"

echo ""
echo "🎉 Setup complete! You can now:"
echo "   - Push to GitHub: git push origin main"
echo "   - Import on Vercel: https://vercel.com/new"
echo ""
echo "⚠️  Don't forget to set DATABASE_URL in Vercel environment variables!"
echo "   DATABASE_URL = $DATABASE_URL"
