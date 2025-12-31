# Python Matching Service Integration

## Overview

The inventory matching engine has been split into two services:

1. **Next.js Frontend** (Vercel) - UI, authentication, database, job management
2. **Python FastAPI Backend** (Render/Railway/Fly.io) - High-performance matching engine

## Architecture

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│  Next.js Frontend (Vercel)  │
│  - UI Components            │
│  - Authentication           │
│  - Database (Prisma)        │
│  - Proxy API Route          │
└────────┬────────────────────┘
         │ HTTP POST
         ▼
┌─────────────────────────────┐
│ Python FastAPI (Render)     │
│  - Matching Engine          │
│  - Column Normalization     │
│  - Line Code Strategy       │
│  - CSV Processing           │
└─────────────────────────────┘
```

## Setup Instructions

### 1. Deploy Python Backend

The Python FastAPI service is located in the root directory:
- `main.py` - FastAPI application
- `inventory_matching_engine.py` - Core matching logic
- `Dockerfile` - Container configuration
- `docker-compose.yml` - Local development
- `requirements.txt` - Python dependencies

**Deploy to Render:**

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Environment Variables**:
     - `INTERNAL_MASTER_PATH=/app/data/Eric(2).xlsx`
     - `INTERCHANGE_PATH=/app/data/AIINTERCHANGEDATA.xlsx`
4. Upload master catalog files to `/app/data/` (use Render's persistent disk)
5. Note the service URL (e.g., `https://inventory-matching-xyz.onrender.com`)

**Alternative: Railway, Fly.io, or Docker**

See `DEPLOYMENT.md` for detailed Docker deployment instructions.

### 2. Configure Next.js Frontend

Add environment variables to Vercel:

```env
MATCHING_SERVICE_URL=https://inventory-matching-xyz.onrender.com
API_SECRET=your-shared-secret-key-here
```

**Generate API Secret:**
```bash
openssl rand -base64 32
```

### 3. Update Python Backend Security

In `main.py`, add authentication middleware:

```python
from fastapi import Header, HTTPException

async def verify_api_secret(x_api_secret: str = Header(None)):
    expected_secret = os.getenv('API_SECRET')
    if expected_secret and x_api_secret != expected_secret:
        raise HTTPException(status_code=403, detail="Invalid API secret")
    return True

@app.post("/match-inventory", dependencies=[Depends(verify_api_secret)])
async def match_inventory(...):
    # existing code
```

## API Endpoints

### Next.js Proxy Route

**POST** `/api/match/proxy`
- Accepts: `multipart/form-data` with `file` field
- Returns: CSV file with matched results
- Timeout: 5 minutes

**GET** `/api/match/proxy`
- Health check endpoint
- Returns: Backend service status

### Python Backend

**POST** `/match-inventory`
- Accepts: `multipart/form-data` with `file` field
- Returns: CSV file with matched results
- Headers: `X-API-Secret` (if configured)

**GET** `/health`
- Health check endpoint
- Returns: `{"status": "healthy", "engine": "loaded"}`

**GET** `/stats`
- Returns catalog statistics
- Response: `{"internal_catalog": {...}, "interchange_data": {...}}`

## Frontend Components

### PythonMatchUploader

React component for uploading files to the Python matching service.

```tsx
import PythonMatchUploader from '@/app/components/PythonMatchUploader';

<PythonMatchUploader
  onMatchComplete={(csvData) => console.log('Matched!', csvData)}
  onMatchError={(error) => console.error(error)}
/>
```

### Quick Match Page

Standalone page for instant matching without database storage.

**URL**: `/quick-match`

Features:
- Direct file upload
- Instant CSV download
- Match statistics
- No authentication required (can be added)

## Column Normalization

The Python service automatically normalizes column names:

| Input Column | Normalized To |
|--------------|---------------|
| Part #, Part_Number, Item # | PART NUMBER |
| Line, Manufacturer, Mfg | LINE |
| Cost, Price, Unit Cost | COST $ |

**Example:**
```csv
Part #,Manufacturer,Price
10026A,ABC,3.01
```
↓ Normalized to ↓
```csv
PART NUMBER,LINE,COST $
10026A,ABC,3.01
```

## Matching Strategy

The Python engine uses a 4-phase waterfall strategy:

1. **Exact Match**: Normalized part number equality
2. **Interchange Lookup**: Cross-reference table matching
3. **Fuzzy Match**: Normalized string comparison
4. **AI Search**: (Placeholder for future implementation)

### Line Code Handling

The system automatically strips 3-character line code prefixes:

- Store: `ABC10026A` → Stripped: `10026A`
- Supplier: `10026A`
- **Match**: ✅

## Testing

### Test Proxy Route

```bash
curl -X POST \
  -F "file=@test_inventory.csv" \
  http://localhost:3000/api/match/proxy \
  -o results.csv
```

### Test Python Backend Directly

```bash
curl -X POST \
  -F "file=@test_inventory.csv" \
  -H "X-API-Secret: your-secret" \
  https://your-python-service.render.com/match-inventory \
  -o results.csv
```

### Health Check

```bash
# Check Next.js proxy
curl http://localhost:3000/api/match/proxy

# Check Python backend
curl https://your-python-service.render.com/health
```

## Monitoring

### Python Backend Logs

**Render Dashboard:**
- Navigate to your service
- Click "Logs" tab
- Look for:
  - `[POSTGRES_MATCHER_V4.0]` - Matching engine version
  - `Found X matches` - Match count
  - `[DIAGNOSTIC]` - Debug information

### Next.js Proxy Logs

**Vercel Dashboard:**
- Navigate to your deployment
- Click "Functions" → "Logs"
- Look for:
  - `[PROXY]` - Proxy route logs
  - HTTP status codes
  - Error messages

## Troubleshooting

### 503 Service Unavailable

**Cause**: Python backend not reachable

**Fix**:
1. Check `MATCHING_SERVICE_URL` in Vercel
2. Verify Python service is running on Render
3. Check firewall/network settings

### 403 Forbidden

**Cause**: API secret mismatch

**Fix**:
1. Verify `API_SECRET` matches in both services
2. Check header name is `X-API-Secret`

### 0% Match Rate

**Cause**: Master catalog not loaded or empty

**Fix**:
1. Check Python backend `/stats` endpoint
2. Verify master files exist in `/app/data/`
3. Check file paths in environment variables

### Timeout Errors

**Cause**: File too large or slow processing

**Fix**:
1. Reduce batch size in Python engine
2. Increase timeout in proxy route
3. Process files in chunks

## Performance

### Benchmarks

| File Size | Items | Processing Time |
|-----------|-------|-----------------|
| 100 KB    | 500   | ~5 seconds      |
| 1 MB      | 5,000 | ~30 seconds     |
| 10 MB     | 50,000| ~3 minutes      |

### Optimization Tips

1. **Batch Processing**: Process large files in chunks
2. **Caching**: Cache frequently matched items
3. **Indexing**: Add database indexes on part numbers
4. **Scaling**: Use multiple Python service instances

## Security Considerations

1. **API Secret**: Use strong random secret (32+ characters)
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Add rate limiting to prevent abuse
4. **File Validation**: Validate file types and sizes
5. **Authentication**: Add user authentication to Quick Match page

## Future Enhancements

- [ ] Add Redis caching for frequently matched items
- [ ] Implement batch processing for large files
- [ ] Add real-time progress updates via WebSockets
- [ ] Store match results in database (optional)
- [ ] Add user authentication to Quick Match
- [ ] Implement rate limiting
- [ ] Add Prometheus metrics
- [ ] Create admin dashboard for monitoring

## Support

For issues or questions:
- Check logs in Render and Vercel dashboards
- Review error messages in browser console
- Contact Arnold Motor Supply Engineering Team

**Version**: 1.0.0  
**Last Updated**: 2025-12-31
