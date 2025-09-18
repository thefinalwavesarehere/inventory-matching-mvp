# Inventory Matching System - MVP

This is a Minimum Viable Product (MVP) demonstration of an AI-powered inventory matching system for Arnold Motor Supply. The system helps match inventory items between Arnold's internal system and supplier catalogs like CarQuest.

## Features

- File upload for Arnold inventory and supplier catalogs
- Basic matching algorithm using part number and description similarity
- Interactive UI for reviewing and confirming matches
- Sample data for demonstration purposes

## Tech Stack

- **Frontend**: Next.js with React and Tailwind CSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: MongoDB (configured but not required for MVP demo)
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/inventory-matching-mvp.git
   cd inventory-matching-mvp
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env.local` file with the following variables:
   ```
   MONGODB_URI=your_mongodb_connection_string
   ```

4. Run the development server:
   ```
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
inventory-matching-mvp/
├── app/                    # Next.js app directory
│   ├── api/                # API routes
│   │   ├── match/          # Matching API
│   │   └── upload/         # File upload API
│   ├── components/         # React components
│   │   ├── forms/          # Form components
│   │   └── ui/             # UI components
│   ├── lib/                # Utility libraries
│   │   ├── db/             # Database utilities
│   │   ├── ml/             # Machine learning utilities
│   │   └── utils/          # General utilities
│   ├── demo/               # Demo page
│   ├── upload/             # Upload page
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Home page
├── public/                 # Static assets
│   └── sample-data/        # Sample data files
└── ...                     # Config files
```

## Deployment

This project is configured for deployment on Vercel:

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Configure environment variables in Vercel dashboard
4. Deploy!

## Future Enhancements

This MVP demonstrates the core functionality of the inventory matching system. Future enhancements could include:

- Advanced machine learning models using TensorFlow.js
- User authentication and role-based access control
- Batch processing for large datasets
- Integration with external APIs
- Comprehensive analytics and reporting
- Mobile-responsive design

## License

This project is proprietary and confidential.

## Contact

For questions or support, please contact [your-email@example.com](mailto:your-email@example.com).
