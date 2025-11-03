# Inventory Matching MVP

AI-powered inventory matching system for Arnold Motor Supply. Automatically matches and normalizes inventory data between Arnold's internal system and supplier catalogs using multi-stage matching with OpenAI Agents SDK.

## Features

- **Multi-Stage Matching**: Part number → Part name → Description → AI web search fallback
- **AI-Powered Search**: OpenAI Agents SDK with web search for unmatched parts
- **Human-in-the-Loop**: Review, confirm, or reject matches with enrichment data
- **Project Management**: Group files into projects for organized workflow
- **File Management**: Upload, delete, and replace files with custom naming
- **Comprehensive Reports**: Export unmatched parts and confirmed matches to Excel
- **Persistent Storage**: All data saved to Prisma Postgres database

## Tech Stack

- **Frontend**: Next.js 13, React, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: Prisma Postgres (PostgreSQL)
- **AI**: OpenAI Agents SDK with GPT-4.1 and web search
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Prisma Postgres database (or any PostgreSQL database)
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/thefinalwavesarehere/inventory-matching-mvp.git
cd inventory-matching-mvp
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add:
```env
DATABASE_URL="postgresql://..."  # Your Prisma Postgres connection string
OPENAI_API_KEY="sk-..."         # Your OpenAI API key
NODE_ENV="development"
```

4. Run database migrations:
```bash
npx prisma generate
npx prisma migrate deploy
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Import the repository in Vercel
3. Add environment variables:
   - `DATABASE_URL` - Your Prisma Postgres connection string
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `NODE_ENV` - Set to `production`
4. Deploy!

Migrations will run automatically on deployment.

## Usage

### 1. Upload Files

Upload your inventory files in the following order:

1. **Interchange File** (optional) - Known mappings between your parts and supplier parts
2. **Arnold Inventory** - Your internal part numbers, usage, and costs
3. **Supplier Catalog** - Supplier part numbers, descriptions, and pricing (e.g., CarQuest)
4. **Inventory Report** (optional) - Detailed inventory with descriptions for enrichment

### 2. Run Matching

After uploading files, click "Run Matching Algorithm" to:
- Match parts by part number
- Match parts by part name
- Match parts by description
- Flag unmatched parts for AI search

### 3. Review Matches

Go to the Match Workflow page to:
- Review confidence scores
- Confirm or reject matches
- Add enrichment data (box size, qty per box, etc.)
- Trigger AI web search for unmatched parts

### 4. Export Reports

Generate Excel reports for:
- Unmatched parts requiring manual matching
- Confirmed matches with enrichment data

## File Formats

### Arnold Inventory (Excel/CSV)
```
Part | TotalUsageLast12 | Cost
-----|------------------|------
ABC123 | 50 | 12.99
```

### Supplier Catalog (Excel/CSV)
```
PART | LINE | PART NUMBER | DESCRIPTION | QTY AVAIL | COST $ | YTD HIST
-----|------|-------------|-------------|-----------|--------|----------
ABC123 | ABC | 123 | Widget | 100 | 10.99 | 500
```

### Interchange File (Excel/CSV)
```
Their SKU | Our SKU
----------|--------
ABC123 | XYZ456
```

### Inventory Report (Excel/CSV)
```
LINE | PART NUMBER | DESCRIPTION | QTY AVL | CURR COST $ | ROLLING 12
-----|-------------|-------------|---------|-------------|------------
ABC | 123 | Widget | 100 | 10.99 | 500
```

## API Endpoints

- `POST /api/upload` - Upload and process files
- `GET /api/upload` - Get all projects
- `POST /api/match` - Run matching algorithm
- `POST /api/confirm` - Confirm or reject matches
- `POST /api/ai-search` - AI-powered web search for parts
- `DELETE /api/delete` - Delete files or projects
- `GET /api/report` - Generate Excel reports

## Project Structure

```
inventory-matching-mvp/
├── app/
│   ├── api/              # API routes
│   │   ├── ai-search/    # AI-powered search
│   │   ├── confirm/      # Match confirmation
│   │   ├── delete/       # File/project deletion
│   │   ├── match/        # Matching algorithm
│   │   ├── report/       # Report generation
│   │   └── upload/       # File upload
│   ├── lib/
│   │   ├── ai/           # AI agent utilities
│   │   ├── db/           # Database utilities
│   │   ├── ml/           # Matching algorithms
│   │   └── utils/        # File processing
│   ├── match/            # Match workflow page
│   ├── projects/         # Project management page
│   ├── upload/           # Upload page
│   └── page.tsx          # Home page
├── prisma/
│   ├── migrations/       # Database migrations
│   └── schema.prisma     # Database schema
└── public/               # Static assets
```

## Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Detailed deployment instructions
- [USER_GUIDE.md](./USER_GUIDE.md) - End-user guide
- [README_IMPLEMENTATION.md](./README_IMPLEMENTATION.md) - Technical implementation details
- [QUICKSTART.md](./QUICKSTART.md) - Quick start guide

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
