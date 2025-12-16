# User Guide - Inventory Matching System

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Uploading Files](#uploading-files)
4. [Running Matching](#running-matching)
5. [Reviewing Matches](#reviewing-matches)
6. [Handling Unmatched Parts](#handling-unmatched-parts)
7. [Generating Reports](#generating-reports)
8. [Best Practices](#best-practices)
9. [FAQ](#faq)

## Introduction

The Inventory Matching System is an AI-powered tool designed to automatically match parts between Arnold Motor Supply's internal inventory and supplier catalogs (primarily CarQuest). The system uses multiple matching strategies to ensure accurate part identification and provides a human-in-the-loop workflow for reviewing and confirming matches.

### Key Features

- **Multi-stage matching**: Part number → Part name → Description → Web search
- **AI-powered web search**: Automatically searches the web for unmatched parts
- **Project-based organization**: Group related files into projects
- **Match confirmation workflow**: Review, confirm, or reject matches
- **Data enrichment**: Add missing information like box size, quantity, etc.
- **Comprehensive reporting**: Export unmatched parts and confirmed matches

## Getting Started

### Accessing the System

1. Open your web browser
2. Navigate to the system URL (provided by your administrator)
3. You'll see the home page with recent projects and quick actions

### Understanding the Workflow

The typical workflow consists of four main steps:

1. **Upload Files** → Upload Arnold inventory and supplier catalog files
2. **Run Matching** → Let the AI match parts automatically
3. **Review Matches** → Confirm, reject, or enrich match results
4. **Generate Reports** → Export unmatched parts for manual processing

## Uploading Files

### Step 1: Create or Select a Project

1. Click "Upload Files" from the home page
2. Choose one of the following:
   - **Select existing project**: Choose from the dropdown menu
   - **Create new project**: Enter a project name (e.g., "Q4 2024 Inventory Update")

### Step 2: Select File Type

Choose the appropriate file type:

- **Arnold Inventory**: Your internal inventory file (ArnoldFile.xlsx)
- **Supplier Catalog**: Supplier's catalog file (CQFile.xlsx)
- **Interchange File**: Known part interchange mappings (Interchange.xlsx)
- **Inventory Report**: Detailed inventory report with descriptions (inventoryinforeport.xls)

### Step 3: Upload the File

1. Click "Choose File" and select your Excel or CSV file
2. Click "Upload File"
3. Wait for the upload to complete (usually 5-10 seconds)
4. Review the upload result and preview

### File Format Requirements

#### Arnold Inventory File
Required columns:
- `Part`: Part number (e.g., AUV20966)
- `TotalUsageLast12`: Usage in last 12 months
- `Cost`: Cost per unit

#### Supplier Catalog File
Required columns:
- `PART`: Full part identifier (e.g., ABC10026A)
- `LINE`: Line code (e.g., ABC, AUV)
- `PART NUMBER`: Part number without line code
- `DESCRIPTION`: Part description
- `QTY AVAIL`: Quantity available
- ` COST $`: Cost (note the space before COST)
- `YTD HIST`: Year-to-date history

#### Interchange File
Required columns:
- `Their SKU`: Supplier's part number
- `Our SKU`: Arnold's part number

### Recommended Upload Order

For best results, upload files in this order:

1. **Interchange File** (if available) - Provides known mappings
2. **Inventory Report** (if available) - Provides descriptions for Arnold parts
3. **Arnold Inventory** - Your master inventory list
4. **Supplier Catalog** - Supplier's current catalog

## Running Matching

### Automatic Matching

After uploading both Arnold Inventory and Supplier Catalog files:

1. Click "Run Matching Algorithm" button
2. Wait for matching to complete (may take 1-3 minutes for large files)
3. Review the matching statistics displayed

### Understanding Match Stages

The system uses a multi-stage matching approach:

1. **Part Number Match** (Highest confidence)
   - Direct part number match
   - Known interchange mapping
   - Line code compatibility check

2. **Part Name Match** (Medium confidence)
   - Fuzzy matching on part names
   - N-gram similarity analysis

3. **Description Match** (Lower confidence)
   - Semantic similarity between descriptions
   - Requires inventory report data

4. **Web Search** (Manual trigger)
   - AI-powered web search for unmatched parts
   - Provides potential matches from online sources

5. **No Match**
   - No suitable match found
   - Requires manual intervention

### Confidence Scores

Each match is assigned a confidence score:

- **90-100%** (Green): High confidence - likely correct match
- **70-89%** (Yellow): Medium confidence - review recommended
- **Below 70%** (Red): Low confidence - verify carefully

## Reviewing Matches

### Navigating the Match Page

1. Click "View Matches" after running matching
2. The page is divided into two sections:
   - **Left panel**: List of all matches
   - **Right panel**: Detailed view of selected match

### Match List Filters

Use the dropdown filter to view:
- **All Matches**: Show everything
- **Pending Only**: Matches awaiting review
- **Confirmed Only**: Already confirmed matches
- **Rejected Only**: Rejected matches

### Reviewing a Match

1. Click on a match in the left panel
2. Review the details:
   - **Arnold Inventory**: Your internal part information
   - **Supplier Catalog**: Matched supplier part information
   - **Match Reasons**: Why the system matched these parts
   - **Confidence Score**: How confident the system is

### Confirming a Match

If the match is correct:

1. (Optional) Add enrichment data:
   - Box Size (e.g., "25 pieces")
   - Qty Per Box (e.g., 25)
2. Click "Confirm Match"
3. The match will be saved and marked as confirmed

**What happens when you confirm:**
- Match is saved to the database
- Enrichment data is stored
- The mapping is added to known interchanges for future matching
- The part is removed from the unmatched list

### Rejecting a Match

If the match is incorrect:

1. Click "Reject Match"
2. The part will be added to the unmatched list
3. You can try web search or handle it manually later

### Adding Notes

You can add notes to any match for future reference (feature to be added in future version).

## Handling Unmatched Parts

### Triggering Web Search

For parts with "No Match" status:

1. Select the unmatched part
2. Click "Try Web Search"
3. Wait for the AI to search the web (2-5 seconds)
4. Review the web search results
5. If a match is found, confirm or reject it

### Batch Web Search

To search for multiple unmatched parts at once:

1. Use the API endpoint (requires technical knowledge):
   ```
   POST /api/web-search
   Body: { "projectId": "your-project-id", "limit": 10 }
   ```

### Manual Matching

For parts that cannot be matched automatically:

1. Generate the unmatched parts report (see next section)
2. Research the parts manually
3. Add them to the interchange file for future matching
4. Re-upload the interchange file

## Generating Reports

### Unmatched Parts Report

To export all unmatched parts:

1. Navigate to the match page for your project
2. Use the API endpoint:
   ```
   GET /api/report?projectId=[YOUR-PROJECT-ID]&format=xlsx
   ```
3. Download the Excel file
4. The report includes:
   - Part number
   - Usage and cost information
   - Attempted matching methods
   - Top 2 attempted matches (if any)
   - Notes

### Confirmed Matches Report

To export all confirmed matches:

1. Use the API endpoint:
   ```
   POST /api/report
   Body: { "projectId": "[YOUR-PROJECT-ID]", "includeEnrichment": true }
   ```
2. Download the Excel file
3. The report includes:
   - Arnold part information
   - Matched supplier part information
   - Match confidence and stage
   - Enrichment data (if included)
   - Confirmation details

### Report Usage

**Unmatched Parts Report**:
- Share with team for manual research
- Identify patterns in unmatched parts
- Update interchange file with manual matches

**Confirmed Matches Report**:
- Import into inventory system
- Share with purchasing team
- Archive for record-keeping

## Best Practices

### File Preparation

1. **Clean your data**: Remove empty rows and columns
2. **Consistent formatting**: Ensure part numbers are formatted consistently
3. **Complete information**: Include all required columns
4. **Regular updates**: Upload interchange files regularly to improve matching

### Matching Strategy

1. **Start with known interchanges**: Upload interchange file first
2. **Review high-confidence matches first**: Focus on 90%+ confidence
3. **Be cautious with low confidence**: Verify matches below 70% carefully
4. **Use web search sparingly**: It consumes API credits

### Project Organization

1. **Use descriptive names**: "Q4 2024 Inventory" instead of "Project 1"
2. **One project per batch**: Don't mix unrelated uploads
3. **Archive old projects**: Keep the project list manageable

### Data Enrichment

1. **Add box sizes**: Helps with ordering and inventory management
2. **Note discrepancies**: If supplier cost differs significantly, add a note
3. **Consistent units**: Use consistent units for quantities

## FAQ

### Q: How long does matching take?

**A**: Typically 1-3 minutes for 10,000 Arnold parts matched against 20,000 supplier parts. Web search adds 2-5 seconds per part.

### Q: Can I upload multiple supplier catalogs?

**A**: Yes, upload them as separate files in the same project. The system will match against all supplier catalogs.

### Q: What happens if I upload the same file twice?

**A**: The system will create duplicate entries. It's recommended to create a new project or delete old upload sessions.

### Q: Can I edit a confirmed match?

**A**: Currently, you need to reject the match and create a new one. A future version will support editing.

### Q: How accurate is the web search?

**A**: Web search accuracy varies (typically 60-80%) and should be verified carefully. It's best used as a last resort.

### Q: Can I undo a confirmation or rejection?

**A**: Not currently. Be careful when confirming or rejecting matches.

### Q: How do I handle parts with multiple potential matches?

**A**: The system shows the best match. If you reject it, you can manually research and add to the interchange file.

### Q: What's the maximum file size?

**A**: On the free tier, files are limited to 4.5MB. For larger files, contact your administrator about upgrading.

### Q: Can I export matches to our inventory system?

**A**: Yes, download the confirmed matches report and import it into your system. The format may need to be adjusted.

### Q: How do I improve matching accuracy?

**A**: 
1. Keep the interchange file updated
2. Upload inventory reports with descriptions
3. Confirm matches to train the system
4. Report issues to the development team

## Getting Help

If you encounter issues:

1. **Check this guide**: Most common questions are answered here
2. **Review error messages**: They often indicate what went wrong
3. **Contact your administrator**: For technical issues or access problems
4. **Provide details**: When reporting issues, include:
   - Project name
   - File name
   - Error message (if any)
   - Steps to reproduce

## Appendix: Keyboard Shortcuts

(To be implemented in future version)

- `Ctrl+U`: Upload file
- `Ctrl+M`: Run matching
- `Ctrl+Enter`: Confirm selected match
- `Ctrl+R`: Reject selected match
- `↑/↓`: Navigate match list

## Changelog

### Version 1.0 (Current)
- Initial release
- Multi-stage matching algorithm
- Web search fallback
- Project management
- Match confirmation workflow
- Report generation

### Planned Features
- Batch operations
- Match editing
- Advanced filters
- User authentication
- Audit logs
- API documentation
