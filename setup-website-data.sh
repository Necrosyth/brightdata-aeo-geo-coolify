#!/bin/bash
# Setup script for Website Data integration

echo "🚀 Setting up Website Data integration..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠️  .env.local not found. Creating from example..."
    cp .env.local.example .env.local
    echo "✅ .env.local created from template. Please edit with your credentials."
    exit 1
fi

echo "📦 Installing dependencies if needed..."
npm install

echo ""
echo "🗄️  Running database migrations..."
echo "Note: This assumes you've set up Supabase. If using raw PostgreSQL, run migrations manually."
echo ""

# Note: Supabase migrations are typically managed via CLI
# For now, we'll just confirm the migration files exist
if [ -f "supabase/migrations/002_website_data.sql" ]; then
    echo "✅ Migration files found"
    echo ""
    echo "Next steps:"
    echo "1. Set up Supabase project at https://supabase.com"
    echo "2. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local"
    echo "3. Run: npm run dev"
    echo "4. Navigate to Website Data tab in the dashboard"
    echo "5. Click 'Scrape Website' to start importing data"
else
    echo "❌ Migration files not found"
    exit 1
fi

echo ""
echo "✨ Setup complete!"
