import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../lib/db/prisma';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const projectId = searchParams.get('projectId');

    if (sessionId) {
      // Delete a specific upload session
      const session = await prisma.uploadSession.findUnique({
        where: { id: sessionId },
        include: { project: true },
      });

      if (!session) {
        return NextResponse.json(
          { error: 'Upload session not found' },
          { status: 404 }
        );
      }

      // Delete the session (cascade will delete related data)
      await prisma.uploadSession.delete({
        where: { id: sessionId },
      });

      return NextResponse.json({
        success: true,
        message: 'File deleted successfully',
        projectId: session.projectId,
      });
    } else if (projectId) {
      // Delete an entire project
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { uploadSessions: true },
      });

      if (!project) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      // Delete the project (cascade will delete all related data)
      await prisma.project.delete({
        where: { id: projectId },
      });

      return NextResponse.json({
        success: true,
        message: `Project "${project.name}" and all ${project.uploadSessions.length} file(s) deleted successfully`,
      });
    } else {
      return NextResponse.json(
        { error: 'Either sessionId or projectId must be provided' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error deleting:', error);
    return NextResponse.json(
      { error: 'Failed to delete' },
      { status: 500 }
    );
  }
}
