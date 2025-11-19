#!/usr/bin/env bash
set -e  # stop script on error

echo "⚠️  This will delete and recreate the gh-pages branch."
read -p "Continue? (y/N): " confirm
[[ "$confirm" == "y" ]] || exit 1

echo "🧹 Deleting local gh-pages branch (if exists)..."
git branch -D gh-pages || true

echo "🧹 Deleting remote gh-pages branch..."
git push origin --delete gh-pages || true

echo "🌱 Creating orphan gh-pages branch..."
git checkout --orphan gh-pages

echo "🗑 Removing unwanted files..."
rm -rf node_modules dist

echo "🗑 Removing tracked files..."
git rm -rf .

echo "📄 Creating README.md..."
echo "gh-pages initial branch" > README.md

echo "➕ Adding files..."
git add README.md

echo "📝 Committing..."
git commit -m "Initial gh-pages branch"

echo "⬆️ Pushing gh-pages branch..."
git push origin gh-pages

echo "🔄 Switching back to main..."
git checkout main

echo "🚀 Running deployment..."
pnpm i
pnpm run deploy

echo "✅ Done!"
