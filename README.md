# Inventory Matching System - MVP

This is a Minimum Viable Product (MVP) demonstration of an AI-powered inventory matching system for Arnold Motor Supply. The system helps match inventory items between Arnold's internal system and supplier catalogs like CarQuest.

## ✨ Features

- **Smart Matching Algorithm**: Compares part numbers, descriptions, and line codes with weighted scoring
- **Confidence Scores**: Each match includes a confidence score (0-100%) and detailed reasoning
- **Interactive UI**: Clean, modern interface for reviewing and confirming matches
- **Test Data**: Pre-loaded with 10 Arnold inventory items and 12 supplier catalog items
- **No Database Required**: Runs entirely in-memory for easy demonstration

## 🚀 Tech Stack

- **Frontend**: Next.js 13 with App Router, React, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Deployment**: Vercel-ready

## 📋 Prerequisites

- Node.js 18+ and npm

## 🛠️ Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/thefinalwavesarehere/inventory-matching-mvp.git
   cd inventory-matching-mvp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
inventory-matching-mvp/
├── app/
│   ├── api/
│   │   └── match/
│   │       └── route.ts          # Match API endpoint
│   ├── demo/
│   │   └── page.tsx              # Demo page with matches
│   ├── lib/
│   │   ├── types.ts              # TypeScript interfaces
│   │   ├── sampleData.ts         # Test data (10 Arnold + 12 supplier items)
│   │   └── matching.ts           # Matching algorithm
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── public/                       # Static assets
├── REBUILD_DESIGN.md             # Design documentation
└── README.md                     # This file
```

## 🎯 How It Works

### Matching Algorithm

The system uses a weighted scoring approach to match items:

1. **Line Code Compatibility (40%)**: Checks for exact matches or known mappings
   - Example: CarQuest "ABH" → Arnold "AUV"
   
2. **Part Number Similarity (30%)**: Compares normalized part numbers
   - Uses character n-grams and Jaccard similarity
   
3. **Description Similarity (30%)**: Analyzes word tokens in descriptions
   - Filters common words and compares meaningful terms

**Threshold**: Matches with confidence scores ≥ 70% are displayed.

### Sample Data

The MVP includes realistic automotive parts data:

**Arnold Inventory (10 items)**:
- Body clips, axle assemblies, brake pads, oil filters, belts, spark plugs, wiper blades, batteries, and trim rivets
- Mix of BOX and EACH units
- Prices ranging from $8.99 to $149.99

**Supplier Catalog (12 items)**:
- Corresponding items with slight variations in naming
- Some exact matches, some partial matches
- Includes non-matching items to test filtering

## 🎨 UI Features

- **Match List**: Sidebar showing all matches sorted by confidence
- **Match Details**: Side-by-side comparison of Arnold and supplier items
- **Confidence Indicators**: Visual stars and percentage scores
- **Match Reasons**: Detailed explanation of why items matched
- **Actions**: Confirm, reject, or skip matches (UI only, not persisted)

## 🚢 Deployment

This project is configured for deployment on Vercel:

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Deploy! (No environment variables required for MVP)

## 📊 API Endpoints

### GET /api/match

Returns matches using sample data.

**Response**:
```json
{
  "success": true,
  "count": 8,
  "matches": [
    {
      "arnoldItem": { ... },
      "supplierItem": { ... },
      "confidenceScore": 0.95,
      "matchReasons": [...]
    }
  ]
}
```

### POST /api/match

Accepts custom inventory and supplier data.

**Request**:
```json
{
  "arnoldItems": [...],
  "supplierItems": [...],
  "threshold": 0.7
}
```

## 🔮 Future Enhancements

- File upload functionality (Excel/CSV)
- Advanced ML models using TensorFlow.js
- User authentication and role-based access
- Database persistence (MongoDB)
- Batch processing for large datasets
- Integration with external supplier APIs
- Analytics and reporting dashboard
- Export matched data

## 🧹 Clean Code Principles

This rebuild focuses on:
- ✅ Simple, readable code
- ✅ Clear separation of concerns
- ✅ Minimal dependencies
- ✅ Comprehensive comments
- ✅ Type safety with TypeScript
- ✅ No database complexity
- ✅ No ML library overhead

## 📝 License

This project is proprietary and confidential.

## 📧 Contact

For questions or support, please contact Arnold Motor Supply.

