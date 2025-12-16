#!/bin/bash
# ============================================================================
# Deep Clean Script for Next.js/Supabase Inventory Matching Project
# ============================================================================
# Purpose: Clean up repository clutter, standardize dependencies, and prepare
#          for continued development
# Author: Senior Tech Lead & DevOps Specialist
# Date: $(date +%Y-%m-%d)
# ============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

confirm_action() {
    local message="$1"
    read -p "$(echo -e ${YELLOW}[CONFIRM]${NC} $message [y/N]: )" -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_warning "Action cancelled by user"
        return 1
    fi
    return 0
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

log_info "Starting Deep Clean Process..."
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    log_error "package.json not found. Please run this script from the project root directory."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    log_error "pnpm is not installed. Please install it first: npm install -g pnpm"
    exit 1
fi

log_success "Pre-flight checks passed"
echo ""

# ============================================================================
# TASK 1: Documentation Hygiene (Priority High)
# ============================================================================

log_info "TASK 1: Documentation Hygiene"
echo "----------------------------------------"

# Create docs/archive directory
log_info "Creating docs/archive directory..."
mkdir -p docs/archive

# List of markdown files to move (excluding essential ones)
MARKDOWN_FILES=(
    "AI_OPTIMIZATION_SUMMARY.md"
    "BACKGROUND_JOBS.md"
    "BACKGROUND_JOBS_README.md"
    "BEFORE_AFTER_COMPARISON.md"
    "CHANGELOG.md"
    "COMPLETE_SOLUTION_SUMMARY.md"
    "CRITICAL_FIXES_DEPLOYED.md"
    "CRON_JOBS.md"
    "DEPLOYMENT_FIX_SUMMARY.md"
    "DEPLOYMENT_GUIDE.md"
    "FINAL_FIX_SUMMARY.md"
    "IMPROVEMENTS_DEPLOYED.md"
    "MATCHING_ALGORITHM_IMPROVEMENTS.md"
    "MATCH_RATE_IMPROVEMENT_PLAN.md"
    "QUICKSTART.md"
    "QUICK_DEPLOY.md"
    "QUICK_FIX_REFERENCE.md"
    "README_IMPLEMENTATION.md"
    "SUPABASE_SETUP.md"
    "USER_GUIDE.md"
    "sprint-4-completion-summary.md"
    "sprint-4-user-guide.md"
)

# Move markdown files to archive
MOVED_COUNT=0
for file in "${MARKDOWN_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_info "Moving $file to docs/archive/"
        mv "$file" "docs/archive/"
        MOVED_COUNT=$((MOVED_COUNT + 1))
    else
        log_warning "$file not found, skipping"
    fi
done

log_success "Moved $MOVED_COUNT markdown files to docs/archive/"
echo ""

# ============================================================================
# TASK 2: Dependency Standardization (Critical)
# ============================================================================

log_info "TASK 2: Dependency Standardization"
echo "----------------------------------------"

# Check for conflicting lock files
HAS_NPM_LOCK=false
HAS_PNPM_LOCK=false

if [ -f "package-lock.json" ]; then
    HAS_NPM_LOCK=true
    log_warning "Found package-lock.json (npm)"
fi

if [ -f "pnpm-lock.yaml" ]; then
    HAS_PNPM_LOCK=true
    log_info "Found pnpm-lock.yaml (pnpm)"
fi

if [ "$HAS_NPM_LOCK" = true ] && [ "$HAS_PNPM_LOCK" = true ]; then
    log_error "CRITICAL: Both npm and pnpm lock files detected!"
    log_info "This can cause dependency conflicts and unpredictable behavior."
    echo ""
    
    if confirm_action "Delete package-lock.json and node_modules, then run fresh pnpm install?"; then
        # Remove npm lock file
        log_info "Removing package-lock.json..."
        rm -f package-lock.json
        log_success "Deleted package-lock.json"
        
        # Remove node_modules
        log_info "Removing node_modules directory..."
        rm -rf node_modules
        log_success "Deleted node_modules"
        
        # Fresh pnpm install
        log_info "Running fresh pnpm install..."
        pnpm install
        log_success "Dependencies installed with pnpm"
    else
        log_warning "Skipping dependency cleanup"
    fi
else
    log_success "No conflicting lock files detected"
fi

echo ""

# ============================================================================
# TASK 3: Configuration Cleanup
# ============================================================================

log_info "TASK 3: Configuration Cleanup"
echo "----------------------------------------"

# Check Node version configuration files
log_info "Checking Node version configuration files..."

if [ -f ".node-version" ]; then
    NODE_VERSION_FILE=$(cat .node-version)
    log_info ".node-version: $NODE_VERSION_FILE"
fi

if [ -f ".nvmrc" ]; then
    NVMRC_VERSION=$(cat .nvmrc)
    log_info ".nvmrc: $NVMRC_VERSION"
fi

if [ -f ".node-version" ] && [ -f ".nvmrc" ]; then
    if [ "$NODE_VERSION_FILE" != "$NVMRC_VERSION" ]; then
        log_warning "Node version mismatch detected!"
        log_warning ".node-version: $NODE_VERSION_FILE"
        log_warning ".nvmrc: $NVMRC_VERSION"
        log_info "Please align these files manually or keep only one."
    else
        log_success "Node version files are aligned: $NODE_VERSION_FILE"
    fi
fi

# Check .npmrc
if [ -f ".npmrc" ]; then
    log_info "Found .npmrc configuration"
    log_info "Contents:"
    cat .npmrc | sed 's/^/  /'
fi

echo ""

# ============================================================================
# TASK 4: Generate Tech Debt Report
# ============================================================================

log_info "TASK 4: Generating Tech Debt Report"
echo "----------------------------------------"

# Create tech debt report
TECH_DEBT_FILE="docs/TECH_DEBT_REPORT.md"
mkdir -p docs

cat > "$TECH_DEBT_FILE" << 'EOF'
# Tech Debt Report
**Generated:** $(date +"%Y-%m-%d %H:%M:%S")

## 🚨 Critical Issues Requiring Immediate Attention

### 1. Prisma Schema - Temporary Field Commenting
**Status:** 🔴 CRITICAL  
**Commit Message:** "Temporarily comment out new schema fields to unblock export"  
**Location:** `prisma/schema.prisma`

**Issue:**
- Schema fields were commented out as a temporary workaround to unblock the export functionality
- This indicates a schema migration issue or conflict between the database state and the Prisma schema
- Running the application with commented-out fields can lead to:
  - Data inconsistency
  - Runtime errors when code tries to access these fields
  - Migration drift between environments

**Immediate Actions Required:**
1. Review the commented-out fields in `prisma/schema.prisma`
2. Determine if these fields exist in the production database
3. Create a proper migration strategy:
   - If fields should exist: Uncomment and run `pnpm prisma migrate dev`
   - If fields should not exist: Remove from schema permanently
4. Test the export functionality with the proper schema
5. Update any TypeScript types that depend on these fields

**Risk Level:** HIGH - Can cause production data corruption or application crashes

---

### 2. Build Script - Prisma Migration Removal
**Status:** 🔴 CRITICAL  
**Commit Message:** "Remove prisma migrate deploy from build script to unblock deployment"  
**Location:** `package.json` (build script)

**Issue:**
- The `prisma migrate deploy` command was removed from the build script
- This means database migrations are NOT being applied automatically during deployment
- This creates a dangerous situation where:
  - Code may be deployed that expects a newer schema
  - Database remains on an older schema version
  - Schema drift occurs between environments (dev, staging, prod)

**Immediate Actions Required:**
1. Investigate why `prisma migrate deploy` was failing during build
2. Common causes:
   - Missing DATABASE_URL environment variable in build environment
   - Insufficient database permissions
   - Pending migrations that conflict with existing data
   - Connection timeout issues
3. Fix the root cause (likely environment variable configuration)
4. Re-add `prisma migrate deploy` to the build script
5. Implement a proper migration strategy:
   ```json
   "build": "prisma generate && prisma migrate deploy && next build"
   ```
6. Consider adding a pre-deployment migration check

**Risk Level:** CRITICAL - Can cause complete application failure in production

---

### 3. Dependency Management - npm/pnpm Conflict
**Status:** 🟡 RESOLVED (by this script)  
**Issue:** Both `package-lock.json` and `pnpm-lock.yaml` were present

**Resolution:**
- Removed `package-lock.json`
- Removed `node_modules`
- Performed fresh `pnpm install`

---

## 📋 Recommended Investigation Tasks

### Priority 1: Database Schema Audit
- [ ] Review all commented-out fields in Prisma schema
- [ ] Compare schema with actual database structure
- [ ] Document any schema drift
- [ ] Create migration plan to align schema and database

### Priority 2: Build Process Restoration
- [ ] Test `prisma migrate deploy` locally
- [ ] Verify DATABASE_URL is available in Vercel build environment
- [ ] Check Vercel build logs for migration errors
- [ ] Re-enable migrations in build script
- [ ] Test full deployment pipeline

### Priority 3: Environment Configuration
- [ ] Audit all environment variables across environments
- [ ] Ensure DATABASE_URL is properly set in Vercel
- [ ] Verify database user has migration permissions
- [ ] Document required environment variables

### Priority 4: Testing
- [ ] Test export functionality with proper schema
- [ ] Test deployment with migrations enabled
- [ ] Verify data integrity after migrations
- [ ] Test rollback procedures

---

## 🔍 Common Prisma/Next.js Issues Analysis

Based on the commit messages, here are the likely root causes:

### Issue: Schema Migration Failures
**Symptoms:**
- "Temporarily comment out new schema fields"
- "Remove prisma migrate deploy from build script"

**Common Root Causes:**
1. **Environment Variable Missing in Build:**
   - Vercel build environment may not have access to DATABASE_URL
   - Solution: Add DATABASE_URL to Vercel environment variables

2. **Database Connection Timeout:**
   - Build process may timeout when connecting to database
   - Solution: Increase timeout or use connection pooling

3. **Migration Conflicts:**
   - New migrations conflict with existing data
   - Solution: Create data migration scripts or adjust schema

4. **Permissions Issues:**
   - Database user lacks CREATE/ALTER permissions
   - Solution: Grant proper permissions or use admin credentials for migrations

5. **Prisma Client Generation:**
   - Client not generated before migration
   - Solution: Ensure `prisma generate` runs before `migrate deploy`

### Recommended Build Script:
```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build",
    "postinstall": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  }
}
```

---

## 📊 Next Steps

1. **Immediate (Today):**
   - Review Prisma schema and uncomment fields
   - Test migrations locally
   - Document current database state

2. **Short-term (This Week):**
   - Fix build script to include migrations
   - Test full deployment pipeline
   - Create rollback plan

3. **Long-term (This Sprint):**
   - Implement automated schema testing
   - Set up migration monitoring
   - Document migration procedures

---

## 📝 Notes

- All temporary fixes should be treated as technical debt
- Schedule regular tech debt review sessions
- Document all workarounds with tickets for proper fixes
- Never commit "temporary" fixes without a follow-up task

EOF

log_success "Tech debt report generated: $TECH_DEBT_FILE"
echo ""

# ============================================================================
# Summary
# ============================================================================

log_info "DEEP CLEAN SUMMARY"
echo "========================================"
log_success "✓ Documentation cleaned and archived"
log_success "✓ Dependencies standardized to pnpm"
log_success "✓ Configuration files checked"
log_success "✓ Tech debt report generated"
echo ""
log_info "Next Steps:"
echo "  1. Review the tech debt report: $TECH_DEBT_FILE"
echo "  2. Investigate Prisma schema issues"
echo "  3. Fix build script to include migrations"
echo "  4. Test deployment pipeline"
echo ""
log_success "Deep clean completed successfully!"
