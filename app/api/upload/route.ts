import { NextRequest, NextResponse } from 'next/server';
import { processExcelFile, validateFileStructure, detectFileType } from '../../lib/utils/fileProcessing';
import prisma from '../../lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    // Get FormData from request
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileType = formData.get('fileType') as string | null;
    const projectId = formData.get('projectId') as string | null;
    const projectName = formData.get('projectName') as string | null;
    const customFileName = formData.get('customFileName') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Auto-detect file type if not provided
    let detectedFileType = fileType;
    if (!detectedFileType) {
      detectedFileType = detectFileType(file.name);
      if (!detectedFileType) {
        return NextResponse.json(
          { error: 'Could not detect file type. Please specify fileType.' },
          { status: 400 }
        );
      }
    }

    // Validate file type
    const validFileTypes = ['arnold', 'supplier', 'interchange', 'inventory_report'];
    if (!validFileTypes.includes(detectedFileType)) {
      return NextResponse.json(
        { error: `Invalid file type. Must be one of: ${validFileTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate file structure
    const validation = validateFileStructure(buffer, detectedFileType as any);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: 'Invalid file structure', 
          details: validation.errors 
        },
        { status: 400 }
      );
    }

    // Process the file
    const items = processExcelFile(buffer, detectedFileType as any);

    if (items.length === 0) {
      return NextResponse.json(
        { error: 'No valid data found in file' },
        { status: 400 }
      );
    }

    // Get or create project
    let project;
    if (projectId) {
      project = await prisma.project.findUnique({
        where: { id: projectId },
      });
      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }
    } else {
      // Create new project
      const name = projectName || `Project ${new Date().toISOString().split('T')[0]}`;
      project = await prisma.project.create({
        data: {
          name,
          description: `Auto-created from ${file.name}`,
        },
      });
    }

    // Create upload session
    const displayName = customFileName || file.name;
    const uploadSession = await prisma.uploadSession.create({
      data: {
        projectId: project.id,
        fileName: displayName,
        fileType: detectedFileType,
        rowCount: items.length,
        status: 'processing',
      },
    });

    // Save items to database based on file type
    try {
      switch (detectedFileType) {
        case 'arnold':
          await prisma.arnoldInventory.createMany({
            data: items.map((item: any) => ({
              sessionId: uploadSession.id,
              partNumber: item.partNumber,
              usageLast12: item.usageLast12,
              cost: item.cost,
              rawData: item.rawData,
            })),
          });
          break;

        case 'supplier':
          await prisma.supplierCatalog.createMany({
            data: items.map((item: any) => ({
              sessionId: uploadSession.id,
              supplierName: 'CarQuest',
              partFull: item.partFull,
              lineCode: item.lineCode,
              partNumber: item.partNumber,
              description: item.description,
              qtyAvail: item.qtyAvail,
              cost: item.cost,
              ytdHist: item.ytdHist,
              rawData: item.rawData,
            })),
          });
          break;

        case 'interchange':
          await prisma.knownInterchange.createMany({
            data: items.map((item: any) => ({
              supplierSku: item.supplierSku,
              arnoldSku: item.arnoldSku,
              source: 'file',
            })),
            skipDuplicates: true, // Avoid duplicate key errors
          });
          break;

        case 'inventory_report':
          // For now, we'll store inventory report data as supplier catalog
          // since it has similar structure and can be used for enrichment
          await prisma.supplierCatalog.createMany({
            data: items.map((item: any) => ({
              sessionId: uploadSession.id,
              supplierName: 'Arnold Inventory Report',
              partFull: item.lineCode && item.partNumber 
                ? `${item.lineCode}${item.partNumber}` 
                : item.partNumber || '',
              lineCode: item.lineCode || '',
              partNumber: item.partNumber || '',
              description: item.description,
              qtyAvail: item.qtyAvail,
              cost: item.cost,
              rawData: item.rawData,
            })),
          });
          break;
      }

      // Update upload session status
      await prisma.uploadSession.update({
        where: { id: uploadSession.id },
        data: { status: 'completed' },
      });

      // Return success response
      return NextResponse.json({
        success: true,
        message: `Successfully processed ${items.length} items`,
        data: {
          projectId: project.id,
          projectName: project.name,
          sessionId: uploadSession.id,
          fileName: file.name,
          fileType: detectedFileType,
          rowCount: items.length,
          preview: items.slice(0, 10), // Return first 10 items for preview
        },
      });

    } catch (dbError) {
      // Update upload session status to failed
      await prisma.uploadSession.update({
        where: { id: uploadSession.id },
        data: { status: 'failed' },
      });

      console.error('Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save data to database' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve upload sessions and projects
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (projectId) {
      // Get specific project with its upload sessions
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          uploadSessions: {
            orderBy: { uploadedAt: 'desc' },
          },
        },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        project,
      });
    } else {
      // Get all projects with their upload sessions
      const projects = await prisma.project.findMany({
        include: {
          uploadSessions: {
            orderBy: { uploadedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        success: true,
        projects,
      });
    }
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
