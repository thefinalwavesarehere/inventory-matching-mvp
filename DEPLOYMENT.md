# Deployment Guide for Inventory Matching System MVP

This guide explains how to deploy the Inventory Matching System MVP to Vercel.

## Prerequisites

1. A GitHub account
2. A Vercel account (can sign up with GitHub)
3. MongoDB Atlas account (for production deployment)

## Deployment Steps

### 1. Push to GitHub

The code is already pushed to GitHub at:
https://github.com/thefinalwavesarehere/inventory-matching-mvp

### 2. Connect to Vercel

1. Log in to your Vercel account: https://vercel.com/login
2. Click "Add New..." and select "Project"
3. Import the GitHub repository: `inventory-matching-mvp`
4. Configure the project:
   - Framework Preset: Next.js
   - Root Directory: ./
   - Build Command: npm run build
   - Output Directory: .next

### 3. Environment Variables

Add the following environment variables in the Vercel project settings:

```
MONGODB_URI=your_mongodb_connection_string
NODE_ENV=production
```

For MongoDB Atlas:
1. Create a new cluster in MongoDB Atlas
2. Create a database user with read/write permissions
3. Get the connection string and add it to Vercel environment variables

### 4. Deploy

Click "Deploy" and wait for the build to complete.

### 5. Custom Domain (Optional)

1. Go to your project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain and follow the instructions

## Continuous Deployment

The project is set up for continuous deployment. Any push to the main branch will trigger a new deployment on Vercel.

## Monitoring

1. View logs in the Vercel dashboard
2. Set up monitoring in MongoDB Atlas for database performance

## Troubleshooting

If you encounter any issues during deployment:

1. Check the build logs in Vercel
2. Verify environment variables are correctly set
3. Ensure MongoDB connection string is valid and the IP address is whitelisted
